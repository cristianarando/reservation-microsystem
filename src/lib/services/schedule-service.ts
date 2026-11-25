// src/lib/services/schedule-service.ts
import { prisma, withImmediateLock } from "@/lib/prisma";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  computeAvailableSlotsForStaff,
  formatTimeHHmm,
  parseDateAndTime,
} from "@/lib/slot-engine";
import {
  diffDaysYYYYMMDD,
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  getDayBoundsInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import {
  AvailabilityUnavailableReason,
  PublicTimeOffNotice,
  WEEKDAY_NAMES_PLURAL,
  isTimeOffOnDate,
} from "@/lib/timeoff-utils";
import {
  validateScheduleOverride,
  validateVacationRange,
} from "@/lib/validation/acceptance-criteria";
import { sanitizeAppointmentForClient } from "@/lib/api-guard";
import {
  cancelAppointmentInTx,
  createIdempotentNotificationInTx,
} from "@/lib/appointment-lifecycle";
import { emitRealtimeEvent, RealtimeEventPayload } from "@/lib/realtime-events";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
} from "@/lib/web-push";

export class ScheduleServiceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const VALID_RESOLUTIONS = new Set(["MOVE_TO_END", "CANCEL_ALL"]);
export const VALID_TIMEOFF_TYPES = new Set([
  "LATE_START",
  "EARLY_LEAVE",
  "FULL_DAY_OFF",
  "CUSTOM_BLOCK",
  "VACATION",
]);

function buildUnavailableReason(params: {
  dateStr: string;
  dayOfWeek: number;
  isSingleStaff: boolean;
  singleStaffName?: string;
  dayTimeOffNotices: PublicTimeOffNotice[];
  anyWithinHorizon: boolean;
  anyHasShiftOnWeekday: boolean;
  anyHasAppointmentOverlap: boolean;
  maxHorizon: number;
  businessTz: string;
}): AvailabilityUnavailableReason {
  const {
    dateStr,
    dayOfWeek,
    isSingleStaff,
    singleStaffName,
    dayTimeOffNotices,
    anyWithinHorizon,
    anyHasShiftOnWeekday,
    anyHasAppointmentOverlap,
    maxHorizon,
    businessTz,
  } = params;

  const subject = singleStaffName || "El profesional";

  const vacationBlocks = dayTimeOffNotices.filter((b) => b.type === "VACATION");
  if (vacationBlocks.length > 0) {
    return {
      code: "VACATION",
      title: isSingleStaff
        ? `${subject} se encuentra de vacaciones`
        : "Personal de vacaciones en esta fecha",
      description: isSingleStaff
        ? "Tiene un periodo de vacaciones o receso agendado en esta fecha. Por favor elige otro día disponible en el calendario."
        : "No hay turnos disponibles por vacaciones programadas en esta fecha. Por favor elige otro día disponible en el calendario.",
      blocks: vacationBlocks,
    };
  }

  const fullDayBlocks = dayTimeOffNotices.filter((b) => {
    if (b.type === "FULL_DAY_OFF") return true;
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    const durationMs = e.getTime() - s.getTime();
    return (
      durationMs >= 20 * 60 * 60 * 1000 ||
      (s.getHours() === 0 && s.getMinutes() === 0 && e.getHours() >= 23 && e.getMinutes() >= 58)
    );
  });

  if (!anyWithinHorizon) {
    return {
      code: "OUTSIDE_HORIZON",
      title: "Fecha fuera del rango habilitado",
      description: `Se habilitan reservas hasta con ${maxHorizon} días de anticipación. Por favor elige una fecha más cercana.`,
    };
  }

  if (!anyHasShiftOnWeekday && fullDayBlocks.length === 0) {
    const weekdayPlural = WEEKDAY_NAMES_PLURAL[dayOfWeek] || "ese día";
    return {
      code: "NO_WORKING_SHIFT",
      title: isSingleStaff
        ? `${subject} no tiene atención los ${weekdayPlural}`
        : `Día no laboral (Sin atención los ${weekdayPlural})`,
      description: isSingleStaff
        ? `Según su horario semanal, ${subject} no atiende los ${weekdayPlural}. Por favor selecciona otra fecha disponible en el calendario.`
        : `Según el horario semanal, no hay atención programada los ${weekdayPlural}. Por favor selecciona otra fecha disponible en el calendario.`,
    };
  }

  if (fullDayBlocks.length > 0) {
    return {
      code: "FULL_DAY_OFF",
      title: isSingleStaff
        ? `${subject} no atiende en esta fecha`
        : "Agenda cerrada en esta fecha",
      description:
        "Se programó un cierre de agenda para este día. Por favor selecciona otra fecha disponible en el calendario.",
      blocks: fullDayBlocks,
    };
  }

  if (dayTimeOffNotices.length > 0) {
    return {
      code: "TIME_OFF_BLOCKED",
      title: isSingleStaff
        ? `Agenda con bloqueo horario (${subject})`
        : "Horarios bloqueados en esta fecha",
      description:
        "Los turnos de esta fecha quedaron cubiertos por bloqueos programados o reservas previas. Por favor elige otra fecha disponible en el calendario.",
      blocks: dayTimeOffNotices,
    };
  }

  if (dateStr === formatLocalDateYYYYMMDD(new Date(), businessTz)) {
    return {
      code: "TODAY_EXHAUSTED",
      title: "No quedan horarios disponibles para hoy.",
      description:
        "El horario de atención ha finalizado o los cupos de hoy están completos. Selecciona mañana u otra fecha en el calendario.",
    };
  }

  if (anyHasAppointmentOverlap) {
    return {
      code: "ALL_BOOKED",
      title: "Sin cupos disponibles en esta fecha.",
      description:
        "Todos los turnos de este día ya están reservados. Por favor elige otra fecha disponible en el calendario.",
    };
  }

  return {
    code: "NO_SLOTS",
    title: "Sin cupos disponibles en esta fecha.",
    description:
      "No hay turnos libres para este día. Por favor elige otra fecha disponible en el calendario.",
  };
}

export async function computeServiceAvailability(params: {
  serviceId: string;
  staffId?: string;
  dateStr: string;
}) {
  const { serviceId, staffId = "ANY", dateStr } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ScheduleServiceError(
      "Formato de fecha inválido (esperado YYYY-MM-DD).",
      400
    );
  }

  const [settings, service] = await Promise.all([
    prisma.businessSettings.findFirst({ where: { id: 1 } }),
    prisma.service.findUnique({ where: { id: serviceId } }),
  ]);

  if (!service || !service.isActive) {
    throw new ScheduleServiceError("Servicio no encontrado o inactivo", 404);
  }

  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const todayStr = formatLocalDateYYYYMMDD(new Date(), businessTz);
  const diffDays = diffDaysYYYYMMDD(dateStr, todayStr);

  if (Number.isNaN(diffDays) || diffDays < 0 || diffDays > 90) {
    return {
      slots: [],
      slotStaffMapping: {},
      timeOffNotices: [],
      unavailableReason: {
        code: "OUTSIDE_HORIZON",
        title: "Fecha fuera del rango permitido",
        description:
          "La fecha seleccionada está fuera del rango permitido para reservas.",
      } satisfies AvailabilityUnavailableReason,
      message: "La fecha seleccionada está fuera del rango permitido.",
    };
  }

  const dayOfWeek = getDayOfWeekInTz(dateStr, businessTz);

  const staffServices = await prisma.staffService.findMany({
    where: {
      serviceId,
      staff: { isActive: true },
    },
    select: { staffId: true },
  });
  const assignedActiveStaffIds = staffServices.map((s) => s.staffId);

  const eligibleStaffIds =
    staffId === "ANY"
      ? assignedActiveStaffIds
      : assignedActiveStaffIds.includes(staffId)
      ? [staffId]
      : [];

  if (eligibleStaffIds.length === 0) {
    let unavailableReason: AvailabilityUnavailableReason = {
      code: "NO_SLOTS",
      title: "Sin cupos disponibles en esta fecha.",
      description:
        "No hay especialistas activos habilitados para realizar este servicio en este momento.",
    };

    if (staffId !== "ANY") {
      const requestedStaff = await prisma.staffProfile.findUnique({
        where: { id: staffId },
        select: { displayName: true, isActive: true },
      });
      if (requestedStaff && !requestedStaff.isActive) {
        unavailableReason = {
          code: "STAFF_PAUSED",
          title: `${requestedStaff.displayName} pausó temporalmente su agenda`,
          description:
            "Este profesional se encuentra en modo vacaciones o pausa inmediata. Elige otro especialista o consulta por WhatsApp.",
        };
      }
    }

    return {
      slots: [],
      slotStaffMapping: {},
      timeOffNotices: [],
      unavailableReason,
    };
  }

  const { startOfDay, endOfDay } = getDayBoundsInTz(dateStr, businessTz);
  const nextMorning = new Date(endOfDay.getTime() + 6 * 60 * 60 * 1000);

  const [staffProfiles, shifts, timeOffs, appointments] = await Promise.all([
    prisma.staffProfile.findMany({ where: { id: { in: eligibleStaffIds } } }),
    prisma.workingShift.findMany({
      where: { staffId: { in: eligibleStaffIds }, dayOfWeek },
    }),
    prisma.timeOff.findMany({
      where: {
        staffId: { in: eligibleStaffIds },
        startAt: { lte: new Date(endOfDay.getTime() + 12 * 3600_000) },
        endAt: { gte: new Date(startOfDay.getTime() - 12 * 3600_000) },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        staffId: { in: eligibleStaffIds },
        startAt: { lte: nextMorning },
        endAt: { gte: startOfDay },
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
      },
    }),
  ]);

  const staffMap = new Map(staffProfiles.map((p) => [p.id, p]));
  const totalServiceDuration = service.durationMin + service.bufferAfterMin;
  const slotStep = settings?.slotStepMin ?? 30;
  const isSingleStaff = staffId !== "ANY";

  const allSlotsMap = new Map<string, string[]>();
  const dayTimeOffNotices: PublicTimeOffNotice[] = [];
  let anyWithinHorizon = false;
  let anyHasShiftOnWeekday = false;
  let anyHasAppointmentOverlap = false;
  let maxHorizon = settings?.bookingHorizonDays ?? 7;
  let pausedSingleStaffName: string | undefined;

  for (const sId of eligibleStaffIds) {
    const staffProfile = staffMap.get(sId);
    if (!staffProfile) continue;
    if (!staffProfile.isActive) {
      if (isSingleStaff) pausedSingleStaffName = staffProfile.displayName;
      continue;
    }

    const staffHorizon =
      staffProfile.customHorizonDays ?? settings?.bookingHorizonDays ?? 7;
    if (staffHorizon > maxHorizon) maxHorizon = staffHorizon;
    if (diffDays > staffHorizon) continue;
    anyWithinHorizon = true;

    const staffShifts = shifts.filter((s) => s.staffId === sId);
    const hasValidShift = staffShifts.some(
      (s) =>
        parseDateAndTime(dateStr, s.endTime, businessTz).getTime() >
        parseDateAndTime(dateStr, s.startTime, businessTz).getTime()
    );
    if (hasValidShift) anyHasShiftOnWeekday = true;

    const staffDayTimeOffs = timeOffs
      .filter((t) => t.staffId === sId)
      .filter((t) => isTimeOffOnDate(t, dateStr));

    for (const t of staffDayTimeOffs) {
      dayTimeOffNotices.push({
        id: t.id,
        staffId: t.staffId,
        staffName: staffProfile.displayName,
        type: t.type,
        reason: t.publicNote ?? null,
        startAt: t.startAt.toISOString(),
        endAt: t.endAt.toISOString(),
      });
    }

    const staffAppointments = appointments.filter((a) => a.staffId === sId);
    if (staffAppointments.length > 0) anyHasAppointmentOverlap = true;

    const staffLeadTime =
      staffProfile.customLeadTimeMin ?? settings?.minLeadTimeMinutes ?? 30;

    const availableForStaff = computeAvailableSlotsForStaff({
      dateStr,
      shifts: staffShifts,
      timeOffs: staffDayTimeOffs,
      appointments: staffAppointments,
      serviceDuration: totalServiceDuration,
      slotStepMin: slotStep,
      leadTimeMin: staffLeadTime,
      now: new Date(),
      timeZone: businessTz,
    });

    for (const time of availableForStaff) {
      const current = allSlotsMap.get(time) || [];
      current.push(sId);
      allSlotsMap.set(time, current);
    }
  }

  const sortedSlots = Array.from(allSlotsMap.keys()).sort();
  const unavailableReason: AvailabilityUnavailableReason | null =
    sortedSlots.length === 0
      ? pausedSingleStaffName && dayTimeOffNotices.length === 0
        ? {
            code: "STAFF_PAUSED",
            title: `${pausedSingleStaffName} pausó temporalmente su agenda`,
            description:
              "Este profesional se encuentra en modo vacaciones o pausa inmediata. Elige otro especialista o consulta por WhatsApp.",
          }
        : buildUnavailableReason({
            dateStr,
            dayOfWeek,
            isSingleStaff,
            singleStaffName: isSingleStaff
              ? staffMap.get(staffId)?.displayName
              : undefined,
            dayTimeOffNotices,
            anyWithinHorizon,
            anyHasShiftOnWeekday,
            anyHasAppointmentOverlap,
            maxHorizon,
            businessTz,
          })
      : null;

  return {
    date: dateStr,
    service,
    slots: sortedSlots,
    slotStaffMapping: Object.fromEntries(allSlotsMap),
    timeOffNotices: dayTimeOffNotices,
    unavailableReason,
  };
}

/**
 * Finds the earliest contiguous interval of `durationMs` starting at or after `initialCursorMs`
 * that fits strictly inside one of `shiftWindows` and does not collide with `occupiedIntervals`.
 * Returns null if `shiftWindows` is empty (never spills into non-working night hours).
 */
export function findNextAvailableSlotInShifts(params: {
  initialCursorMs: number;
  durationMs: number;
  endOfDayMs: number;
  shiftWindows: Array<{ start: number; end: number }>;
  occupiedIntervals: Array<{ start: number; end: number }>;
}): { start: number; end: number } | null {
  const {
    initialCursorMs,
    durationMs,
    endOfDayMs,
    shiftWindows,
    occupiedIntervals,
  } = params;

  if (shiftWindows.length === 0) {
    return null;
  }

  for (const win of shiftWindows) {
    let cursor = Math.max(initialCursorMs, win.start);

    while (cursor + durationMs <= win.end && cursor + durationMs <= endOfDayMs) {
      const candidateStart = cursor;
      const candidateEnd = cursor + durationMs;

      const colliding = occupiedIntervals.find(
        (occ) => candidateStart < occ.end && candidateEnd > occ.start
      );

      if (!colliding) {
        return { start: candidateStart, end: candidateEnd };
      }

      cursor = Math.max(cursor + 60_000, colliding.end);
    }
  }

  return null;
}

export async function applyDayOverride(params: {
  actorUser: { id: string; role: string; name?: string | null };
  staffId: string;
  type: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
  publicNote?: string | null;
  resolution?: string;
}) {
  const {
    actorUser,
    staffId,
    type,
    startDate,
    endDate,
    reason,
    publicNote,
    resolution,
  } = params;

  const now = new Date();
  const cleanInternalReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 300) : null;
  const cleanPublicNote =
    typeof publicNote === "string" && publicNote.trim()
      ? publicNote.trim().slice(0, 200)
      : null;

  const txOutcome = await withImmediateLock(async (tx) => {
    const settings = await tx.businessSettings.findFirst({
      where: { id: 1 },
      select: { timezone: true, pushHideDetails: true },
    });
    const businessTz = resolveBusinessTimeZone(settings?.timezone);
    const hidePushDetails = Boolean(settings?.pushHideDetails);

    const targetStaffRecords = await tx.staffProfile.findMany({
      where: staffId === "ALL" ? { isActive: true } : { id: staffId },
      include: { workingShifts: true, timeOffs: true },
    });

    if (targetStaffRecords.length === 0) {
      throw new ScheduleServiceError(
        "No se encontraron profesionales activos para aplicar el bloqueo.",
        404
      );
    }

    const targetStaffIds = targetStaffRecords.map((s) => s.id);

    if (type === "VACATION") {
      if (endDate <= now) {
        throw new ScheduleServiceError(
          "No es posible programar vacaciones en fechas pasadas.",
          400
        );
      }
      const vacValidation = validateVacationRange({
        startDate: formatLocalDateYYYYMMDD(startDate, businessTz),
        endDate: formatLocalDateYYYYMMDD(endDate, businessTz),
        targets: targetStaffRecords,
        now,
      });
      if (!vacValidation.valid) {
        throw new ScheduleServiceError(
          vacValidation.error || "Rango de vacaciones inválido.",
          400
        );
      }
    } else if (
      type === "LATE_START" ||
      type === "EARLY_LEAVE" ||
      type === "FULL_DAY_OFF"
    ) {
      const dateStr = formatLocalDateYYYYMMDD(startDate, businessTz);
      const timeStr =
        type === "EARLY_LEAVE"
          ? formatTimeHHmm(startDate, businessTz)
          : type === "LATE_START"
          ? formatTimeHHmm(endDate, businessTz)
          : undefined;
      const overrideValidation = validateScheduleOverride({
        type,
        dateStr,
        timeStr,
        targets: targetStaffRecords,
        isAllTargets: staffId === "ALL",
        now,
      });

      if (!overrideValidation.valid) {
        throw new ScheduleServiceError(
          overrideValidation.error || "Bloqueo inválido.",
          400
        );
      }
    }

    const endHourInTz = Number(formatTimeHHmm(endDate, businessTz).split(":")[0]);
    if (
      resolution === "MOVE_TO_END" &&
      (type === "FULL_DAY_OFF" ||
        type === "VACATION" ||
        type === "EARLY_LEAVE" ||
        endHourInTz >= 22)
    ) {
      throw new ScheduleServiceError(
        "No es posible mover citas para después del bloqueo cuando se cierra la jornada o son vacaciones. Selecciona cancelar las citas afectadas.",
        400
      );
    }

    const conflicting = await tx.appointment.findMany({
      where: {
        staffId: { in: targetStaffIds },
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        startAt: { lt: endDate },
        endAt: { gt: startDate },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
        service: true,
        staff: true,
      },
      orderBy: { startAt: "asc" },
    });

    if (conflicting.length > 0 && !resolution) {
      return {
        needsResolution: true as const,
        conflicting,
      };
    }

    const emittedEvents: RealtimeEventPayload[] = [];
    const dayStr = formatLocalDateYYYYMMDD(endDate, businessTz);
    const { endOfDay } = getDayBoundsInTz(dayStr, businessTz);
    const dayOfWeek = getDayOfWeekInTz(dayStr, businessTz);

    if (conflicting.length > 0 && resolution === "MOVE_TO_END") {
      for (const staffRecord of targetStaffRecords) {
        const staffConflicts = conflicting.filter(
          (c) => c.staffId === staffRecord.id
        );
        if (staffConflicts.length === 0) continue;

        const [remainingApts, otherBlocks] = await Promise.all([
          tx.appointment.findMany({
            where: {
              staffId: staffRecord.id,
              id: { notIn: staffConflicts.map((c) => c.id) },
              status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
              startAt: { lt: endOfDay },
              endAt: { gt: endDate },
            },
            orderBy: { startAt: "asc" },
          }),
          tx.timeOff.findMany({
            where: {
              staffId: staffRecord.id,
              startAt: { lt: endOfDay },
              endAt: { gt: endDate },
            },
            orderBy: { startAt: "asc" },
          }),
        ]);

        const occupiedIntervals: Array<{ start: number; end: number }> = [
          { start: startDate.getTime(), end: endDate.getTime() },
          ...remainingApts.map((a) => ({
            start: new Date(a.startAt).getTime(),
            end: new Date(a.endAt).getTime(),
          })),
          ...otherBlocks.map((b) => ({
            start: new Date(b.startAt).getTime(),
            end: new Date(b.endAt).getTime(),
          })),
        ];

        const shiftWindows = staffRecord.workingShifts
          .filter((s) => s.dayOfWeek === dayOfWeek)
          .map((s) => ({
            start: parseDateAndTime(dayStr, s.startTime, businessTz).getTime(),
            end: parseDateAndTime(dayStr, s.endTime, businessTz).getTime(),
          }))
          .filter((w) => w.end > w.start)
          .sort((a, b) => a.start - b.start);

        let staffCursorMs = endDate.getTime();

        for (const apt of staffConflicts) {
          const durationMs =
            (apt.service.durationMin + apt.service.bufferAfterMin) * 60_000;

          const plannedSlot = findNextAvailableSlotInShifts({
            initialCursorMs: staffCursorMs,
            durationMs,
            endOfDayMs: endOfDay.getTime(),
            shiftWindows,
            occupiedIntervals,
          });

          if (!plannedSlot) {
            throw new ScheduleServiceError(
              `No hay suficientes huecos disponibles dentro del turno de ${staffRecord.displayName} para mover las citas afectadas. Selecciona cancelar las citas o ajusta el bloqueo.`,
              409
            );
          }

          const newStart = new Date(plannedSlot.start);
          const newEnd = new Date(plannedSlot.end);
          occupiedIntervals.push({
            start: plannedSlot.start,
            end: plannedSlot.end,
          });
          staffCursorMs = plannedSlot.end;

          const nextVersion = (apt.rescheduleVersion ?? 0) + 1;

          const updatedCount = await tx.appointment.updateMany({
            where: {
              id: apt.id,
              status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            },
            data: {
              previousStartAt: apt.startAt,
              startAt: newStart,
              endAt: newEnd,
              status: "RESCHEDULED_BY_STAFF",
              allowFreeCancel: true,
              rescheduleVersion: nextVersion,
              staffMoveReason:
                cleanInternalReason || "Imprevisto de agenda del profesional",
            },
          });

          if (updatedCount.count === 0) {
            throw new ScheduleServiceError(
              "Una de las citas afectadas cambió de estado durante la operación. Intenta nuevamente.",
              409
            );
          }

          const oldStartDate = new Date(apt.startAt);
          const oldTimeStr = formatSpanishTimeInTz(oldStartDate, businessTz);
          const newTimeStr = formatSpanishTimeInTz(newStart, businessTz);
          const newDateStr = formatSpanishDateInTz(newStart, businessTz);
          const serviceLabel = apt.service?.name || "Servicio";
          const staffLabel = apt.staff?.displayName || "el profesional";
          const reasonLabel = cleanInternalReason || "Imprevisto de agenda";

          const moveEventKey = `apt:${apt.id}:moved:v${nextVersion}`;
          const notif = await createIdempotentNotificationInTx(tx, {
            userId: apt.customerId,
            appointmentId: apt.id,
            eventKey: `${moveEventKey}:user:${apt.customerId}`,
            type: "APPOINTMENT_MOVED",
            title: "Tu cita fue reprogramada por el profesional",
            message: `${staffLabel} reprogramó tu cita de ${serviceLabel} para el ${newDateStr} a las ${newTimeStr} (${reasonLabel}). Puedes confirmarla o cancelarla sin penalización.`,
          });

          await enqueuePushDeliveriesInTx(tx, {
            eventKey: moveEventKey,
            eventType: "APPOINTMENT_RESCHEDULED",
            appointmentId: apt.id,
            notificationId: notif.id,
            recipientUserIds: [apt.customerId],
            actorUserId: actorUser.id,
            title: hidePushDetails
              ? "Cambio de horario en tu cita"
              : `🕒 Nuevo horario: ${serviceLabel} (${newTimeStr})`,
            body: hidePushDetails
              ? "Tu cita fue reprogramada. Toca para confirmar o revisar el nuevo horario."
              : `${staffLabel} reprogramó tu cita de ${serviceLabel} (antes ${oldTimeStr}) para el ${newDateStr} a las ${newTimeStr} por "${reasonLabel}". Toca para confirmar o cancelar sin cargo.`,
            targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(apt.id)}`,
            tag: `apt-move-${apt.id}`,
          });

          emittedEvents.push({
            type: "APPOINTMENT_UPDATED",
            appointmentId: apt.id,
            staffId: apt.staffId,
            customerId: apt.customerId,
            actorUserId: actorUser.id,
            serviceName: serviceLabel,
            staffName: staffLabel,
            previousStartAt: oldStartDate.toISOString(),
            reason: reasonLabel,
            status: "RESCHEDULED_BY_STAFF",
            startAt: newStart.toISOString(),
            eventKey: moveEventKey,
          });
        }
      }
    } else if (conflicting.length > 0 && resolution === "CANCEL_ALL") {
      const affectedCustomerApts = new Map<string, typeof conflicting>();

      for (const apt of conflicting) {
        const cancelRes = await cancelAppointmentInTx(tx, {
          appointmentId: apt.id,
          actorUser,
          reason: cleanInternalReason || "Cancelada por imprevisto del profesional",
          isMassClosure: true,
        });
        if (cancelRes.realtimeEvent) {
          emittedEvents.push(cancelRes.realtimeEvent);
        }
        if (!cancelRes.alreadyCancelled) {
          const list = affectedCustomerApts.get(apt.customerId) || [];
          list.push(apt);
          affectedCustomerApts.set(apt.customerId, list);
        }
      }

      for (const [custId, apts] of affectedCustomerApts.entries()) {
        const aptIds = apts.map((a) => a.id);
        const sortedIdsKey = [...aptIds].sort().join(",");
        const massEventKey = `mass_cancel:${sortedIdsKey}:user:${custId}`;
        const targetPath =
          aptIds.length === 1
            ? `/?tab=my-appointments&appointmentId=${encodeURIComponent(aptIds[0])}`
            : "/?tab=my-appointments";

        let pushTitle: string;
        let pushBody: string;
        if (hidePushDetails) {
          pushTitle = "Actualización importante de tu agenda";
          pushBody =
            "Se cancelaron una o más citas por un cierre de agenda. Toca para reagendar.";
        } else if (apts.length === 1) {
          const apt0 = apts[0];
          const apt0Date = new Date(apt0.startAt);
          const time0 = formatSpanishTimeInTz(apt0Date, businessTz);
          const date0 = formatSpanishDateInTz(apt0Date, businessTz);
          const service0 = apt0.service?.name || "Servicio";
          const staff0 = apt0.staff?.displayName || "El profesional";
          pushTitle = `⚠️ Cita cancelada: ${service0} (${time0})`;
          pushBody = `${staff0} canceló tu cita de ${service0} del ${date0} a las ${time0}. Motivo: "${
            cleanInternalReason || "Imprevisto de agenda"
          }". Toca para reagendar.`;
        } else {
          const serviceNames = apts
            .map((a) => a.service?.name || "Servicio")
            .join(", ");
          pushTitle = `⚠️ ${apts.length} citas canceladas en tu agenda`;
          pushBody = `Se cancelaron tus citas (${serviceNames}) por "${
            cleanInternalReason || "Cierre de agenda"
          }". Toca para elegir nuevos horarios.`;
        }

        await enqueuePushDeliveriesInTx(tx, {
          eventKey: massEventKey,
          eventType: "MASS_CANCELLATION",
          appointmentId: aptIds[0] || null,
          recipientUserIds: [custId],
          actorUserId: actorUser.id,
          title: pushTitle,
          body: pushBody,
          targetPath,
          tag: `mass-cancel-${custId}-${startDate.getTime()}`,
        });
      }
    }

    if (type === "FULL_DAY_OFF" || type === "VACATION") {
      await tx.timeOff.deleteMany({
        where: {
          staffId: { in: targetStaffIds },
          type: { not: "VACATION" },
          startAt: { gte: startDate },
          endAt: { lte: endDate },
        },
      });
    } else if (type === "LATE_START" || type === "EARLY_LEAVE") {
      const startDayStr = formatLocalDateYYYYMMDD(startDate, businessTz);
      const { startOfDay: dayStartBound, endOfDay: dayEndBound } = getDayBoundsInTz(
        startDayStr,
        businessTz
      );
      await tx.timeOff.deleteMany({
        where: {
          staffId: { in: targetStaffIds },
          type,
          startAt: { gte: dayStartBound },
          endAt: { lte: dayEndBound },
        },
      });
    }

    const createdTimeOffs = [];
    for (const tStaffId of targetStaffIds) {
      const created = await tx.timeOff.create({
        data: {
          staffId: tStaffId,
          startAt: startDate,
          endAt: endDate,
          type,
          reason: cleanInternalReason,
          publicNote: cleanPublicNote,
        },
      });
      createdTimeOffs.push(created);
    }

    return {
      needsResolution: false as const,
      createdTimeOffs,
      conflictsResolved: conflicting.length,
      emittedEvents,
    };
  });

  if (txOutcome.needsResolution) {
    return {
      hasConflicts: true as const,
      message: `Existen ${txOutcome.conflicting.length} cita(s) agendada(s) en este horario.`,
      affectedAppointments: txOutcome.conflicting.map((apt) =>
        sanitizeAppointmentForClient(apt, actorUser.role)
      ),
    };
  }

  for (const ev of txOutcome.emittedEvents) {
    emitRealtimeEvent(ev);
  }
  emitRealtimeEvent({
    type: "SCHEDULE_UPDATED",
    staffId: staffId === "ALL" ? undefined : staffId,
    actorUserId: actorUser.id,
  });

  void dispatchPendingPushDeliveries().catch((err) => {
    console.error("[WebPush] Day override dispatch error:", err);
  });

  return {
    hasConflicts: false as const,
    ok: true,
    timeOff: txOutcome.createdTimeOffs[0] || null,
    timeOffs: txOutcome.createdTimeOffs,
    conflictsResolved: txOutcome.conflictsResolved,
  };
}
