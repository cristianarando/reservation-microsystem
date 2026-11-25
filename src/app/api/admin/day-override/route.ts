// src/app/api/admin/day-override/route.ts
import { NextResponse } from "next/server";
import { prisma, withImmediateLock } from "@/lib/prisma";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { formatTimeHHmm, parseDateAndTime } from "@/lib/slot-engine";
import {
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  getDayBoundsInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import {
  validateScheduleOverride,
  validateVacationRange,
} from "@/lib/validation/acceptance-criteria";
import { emitRealtimeEvent, RealtimeEventPayload } from "@/lib/realtime-events";
import {
  parseJsonObject,
  requireStaffOrAdmin,
  safeErrorResponse,
  sanitizeAppointmentForClient,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  cancelAppointmentInTx,
  createIdempotentNotificationInTx,
} from "@/lib/appointment-lifecycle";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
} from "@/lib/web-push";

export const dynamic = "force-dynamic";

const VALID_RESOLUTIONS = new Set(["MOVE_TO_END", "CANCEL_ALL"]);
const VALID_TIMEOFF_TYPES = new Set([
  "LATE_START",
  "EARLY_LEAVE",
  "FULL_DAY_OFF",
  "CUSTOM_BLOCK",
  "VACATION",
]);

class DayOverrideError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Finds the earliest contiguous interval of `durationMs` starting at or after `initialCursorMs`
 * that fits strictly inside one of `shiftWindows` and does not collide with `occupiedIntervals`.
 * Returns null if `shiftWindows` is empty (never spills into non-working night hours).
 */
function findNextAvailableSlotInShifts(params: {
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

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const { staffId, type, startAt, endAt, reason, publicNote, resolution } =
      parsedBody.data as {
        staffId?: string;
        type?: string;
        startAt?: string;
        endAt?: string;
        reason?: string;
        publicNote?: string;
        resolution?: string;
      };

    if (!staffId || !startAt || !endAt || !type || typeof type !== "string" || !VALID_TIMEOFF_TYPES.has(type)) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios o el tipo de bloqueo es inválido." },
        { status: 400 }
      );
    }

    if (
      resolution !== undefined &&
      resolution !== null &&
      resolution !== "" &&
      (typeof resolution !== "string" || !VALID_RESOLUTIONS.has(resolution))
    ) {
      return NextResponse.json(
        {
          error:
            "Resolución de conflictos inválida. Selecciona MOVE_TO_END o CANCEL_ALL.",
        },
        { status: 400 }
      );
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (
      isNaN(startDate.getTime()) ||
      isNaN(endDate.getTime()) ||
      endDate <= startDate
    ) {
      return NextResponse.json(
        { error: "El rango horario del bloqueo es inválido." },
        { status: 400 }
      );
    }

    if (user.role === "PROVIDER") {
      const ownershipErr = await verifyProviderOwnsStaff(user, staffId);
      if (ownershipErr) return ownershipErr;
    }

    const now = new Date();
    const cleanInternalReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim().slice(0, 300)
        : null;
    const cleanPublicNote =
      typeof publicNote === "string" && publicNote.trim()
        ? publicNote.trim().slice(0, 200)
        : null;

    // Execute validation, conflict detection, per-staff slot planning, appointment mutations, notifications, push deliveries, and TimeOff creation atomically
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
        throw new DayOverrideError(
          "No se encontraron profesionales activos para aplicar el bloqueo.",
          404
        );
      }

      const targetStaffIds = targetStaffRecords.map((s) => s.id);

      // Enforce temporal & state invariants
      if (type === "VACATION") {
        if (endDate <= now) {
          throw new DayOverrideError(
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
          throw new DayOverrideError(vacValidation.error || "Rango de vacaciones inválido.", 400);
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
          throw new DayOverrideError(overrideValidation.error || "Bloqueo inválido.", 400);
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
        throw new DayOverrideError(
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
        // Compute an independent relocation plan per professional
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
              throw new DayOverrideError(
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
              throw new DayOverrideError(
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
              actorUserId: user.id,
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
              actorUserId: user.id,
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
            actorUser: user,
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

        // Enqueue one consolidated Web Push notification per affected customer for this mass closure
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
            actorUserId: user.id,
            title: pushTitle,
            body: pushBody,
            targetPath,
            tag: `mass-cancel-${custId}-${startDate.getTime()}`,
          });
        }
      }

      // 3. Save TimeOff record inside the same transaction
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
      return NextResponse.json({
        hasConflicts: true,
        message: `Existen ${txOutcome.conflicting.length} cita(s) agendada(s) en este horario.`,
        affectedAppointments: txOutcome.conflicting.map((apt) =>
          sanitizeAppointmentForClient(apt, user.role)
        ),
      });
    }

    for (const ev of txOutcome.emittedEvents) {
      emitRealtimeEvent(ev);
    }
    emitRealtimeEvent({
      type: "SCHEDULE_UPDATED",
      staffId: staffId === "ALL" ? undefined : staffId,
      actorUserId: user.id,
    });

    void dispatchPendingPushDeliveries().catch((err) => {
      console.error("[WebPush] Day override dispatch error:", err);
    });

    return NextResponse.json({
      ok: true,
      timeOff: txOutcome.createdTimeOffs[0] || null,
      timeOffs: txOutcome.createdTimeOffs,
      conflictsResolved: txOutcome.conflictsResolved,
    });
  } catch (error: unknown) {
    if (error instanceof DayOverrideError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo aplicar el bloqueo de horario.");
  }
}

export async function DELETE(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Falta el parámetro id del bloqueo (TimeOff)" },
        { status: 400 }
      );
    }

    const existing = await prisma.timeOff.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Bloqueo no encontrado" }, { status: 404 });
    }

    const ownershipErr = await verifyProviderOwnsStaff(user, existing.staffId);
    if (ownershipErr) return ownershipErr;

    await prisma.timeOff.delete({ where: { id } });

    emitRealtimeEvent({
      type: "SCHEDULE_UPDATED",
      staffId: existing.staffId,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return safeErrorResponse(error, "No se pudo eliminar el bloqueo de horario.");
  }
}
