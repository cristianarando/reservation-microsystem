// src/lib/services/booking-service.ts
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { withImmediateLock } from "@/lib/prisma";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import {
  computeAvailableSlotsForStaff,
  parseDateAndTime,
} from "@/lib/slot-engine";
import {
  canCustomerRescheduleAppointment,
  isActiveBookingStatus,
} from "@/lib/booking-rules";
import { timeToMinutes } from "@/lib/validation/acceptance-criteria";
import { normalizeEmail } from "@/lib/validation/input-validators";
import {
  diffDaysYYYYMMDD,
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  getDayBoundsInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import { sanitizeAppointmentForClient } from "@/lib/api-guard";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import {
  createIdempotentNotificationInTx,
  resolveStaffRecipientUserIdsInTx,
} from "@/lib/appointment-lifecycle";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
} from "@/lib/web-push";

export class BookingConflictError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export async function createCustomerAppointment(params: {
  customerId: string;
  viewerRole: string;
  serviceId: string;
  staffId?: string;
  date: string;
  time: string;
  customerNotes?: string | null;
}) {
  const {
    customerId,
    viewerRole,
    serviceId,
    staffId = "ANY",
    date,
    time,
    customerNotes,
  } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new BookingConflictError(
      "Formato de fecha (YYYY-MM-DD) u hora (HH:mm) inválido.",
      400
    );
  }

  const requestedStaffId = staffId.trim() || "ANY";

  const newAppointment = await withImmediateLock(async (tx) => {
    const now = new Date();
    const settings = await tx.businessSettings.findFirst({ where: { id: 1 } });
    const businessTz = resolveBusinessTimeZone(settings?.timezone);
    const hidePushDetails = Boolean(settings?.pushHideDetails);
    const maxActive = settings?.maxActiveBookings ?? 2;
    const slotStep = settings?.slotStepMin ?? 30;

    const txActiveCount = await tx.appointment.count({
      where: {
        customerId,
        endAt: { gt: now },
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
      },
    });
    if (txActiveCount >= maxActive) {
      throw new BookingConflictError(
        `Ya tienes ${txActiveCount} citas futuras activas (el máximo permitido es ${maxActive}). Asiste a tu cita o modifícala antes de reservar una nueva.`,
        429
      );
    }

    const service = await tx.service.findUnique({ where: { id: serviceId } });
    if (!service || !service.isActive) {
      throw new BookingConflictError("Servicio no encontrado o inactivo.", 404);
    }

    const startAt = parseDateAndTime(date, time, businessTz);
    if (isNaN(startAt.getTime())) {
      throw new BookingConflictError("Fecha u hora inválida.", 400);
    }

    const totalDurationMin = service.durationMin + service.bufferAfterMin;
    const endAt = new Date(startAt.getTime() + totalDurationMin * 60_000);

    const todayStr = formatLocalDateYYYYMMDD(now, businessTz);
    const diffDays = diffDaysYYYYMMDD(date, todayStr);
    if (Number.isNaN(diffDays) || diffDays < 0) {
      throw new BookingConflictError(
        "No es posible agendar citas en fechas pasadas.",
        400
      );
    }

    const selfOverlap = await tx.appointment.findFirst({
      where: {
        customerId,
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (selfOverlap) {
      throw new BookingConflictError(
        "Ya tienes otra cita reservada en ese mismo horario. Elige un horario distinto.",
        409
      );
    }

    const dayOfWeek = getDayOfWeekInTz(date, businessTz);
    const { startOfDay, endOfDay } = getDayBoundsInTz(date, businessTz);
    const nextMorning = new Date(endOfDay.getTime() + 6 * 60 * 60 * 1000);

    const verifyCandidateStaffInTx = async (
      candidateStaffId: string
    ): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const staffProfile = await tx.staffProfile.findUnique({
        where: { id: candidateStaffId },
      });
      if (!staffProfile || !staffProfile.isActive) {
        return {
          ok: false,
          reason: "El profesional seleccionado no se encuentra activo.",
        };
      }

      const staffHorizon =
        staffProfile.customHorizonDays ?? settings?.bookingHorizonDays ?? 7;
      if (diffDays > staffHorizon) {
        return {
          ok: false,
          reason: `La agenda del profesional solo está abierta para los próximos ${staffHorizon} días.`,
        };
      }

      const staffLeadTime =
        staffProfile.customLeadTimeMin ?? settings?.minLeadTimeMinutes ?? 30;
      const [staffShifts, staffTimeOffs, staffAppointments] = await Promise.all([
        tx.workingShift.findMany({
          where: { staffId: candidateStaffId, dayOfWeek },
        }),
        tx.timeOff.findMany({
          where: {
            staffId: candidateStaffId,
            startAt: { lte: nextMorning },
            endAt: { gte: new Date(startOfDay.getTime() - 12 * 3600_000) },
          },
        }),
        tx.appointment.findMany({
          where: {
            staffId: candidateStaffId,
            startAt: { lte: nextMorning },
            endAt: { gte: startOfDay },
            status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
          },
        }),
      ]);

      const validSlots = computeAvailableSlotsForStaff({
        dateStr: date,
        shifts: staffShifts,
        timeOffs: staffTimeOffs,
        appointments: staffAppointments,
        serviceDuration: totalDurationMin,
        slotStepMin: slotStep,
        leadTimeMin: staffLeadTime,
        now,
        timeZone: businessTz,
      });

      if (!validSlots.includes(time)) {
        return {
          ok: false,
          reason:
            "El horario seleccionado no está disponible o ya pasó el margen de reserva.",
        };
      }

      return { ok: true };
    };

    let targetStaffId: string | null = null;

    if (requestedStaffId === "ANY") {
      const eligible = await tx.staffService.findMany({
        where: { serviceId, staff: { isActive: true } },
        include: { staff: true },
        orderBy: { staff: { sortOrder: "asc" } },
      });
      for (const item of eligible) {
        const check = await verifyCandidateStaffInTx(item.staffId);
        if (check.ok) {
          targetStaffId = item.staffId;
          break;
        }
      }
      if (!targetStaffId) {
        throw new BookingConflictError(
          "No hay profesionales disponibles en este horario exacto.",
          409
        );
      }
    } else {
      const isAssigned = await tx.staffService.findUnique({
        where: {
          staffId_serviceId: {
            staffId: requestedStaffId,
            serviceId,
          },
        },
      });
      if (!isAssigned) {
        throw new BookingConflictError(
          "El profesional seleccionado no ofrece este servicio.",
          400
        );
      }

      const check = await verifyCandidateStaffInTx(requestedStaffId);
      if (!check.ok) {
        throw new BookingConflictError(check.reason, 409);
      }
      targetStaffId = requestedStaffId;
    }

    const created = await tx.appointment.create({
      data: {
        customerId,
        staffId: targetStaffId,
        serviceId,
        startAt,
        endAt,
        status: "CONFIRMED",
        priceSnapshot: service.price,
        customerNotes:
          typeof customerNotes === "string" && customerNotes.trim()
            ? customerNotes.trim().slice(0, 500)
            : null,
      },
      include: {
        service: true,
        staff: true,
        customer: { select: { name: true } },
      },
    });

    const customerLabel = created.customer?.name || "Un cliente";
    const serviceLabel = created.service?.name || "Servicio";
    const staffLabel = created.staff?.displayName || "Profesional";
    const dateFormatted = formatSpanishDateInTz(startAt, businessTz);
    const noteSnippet = created.customerNotes
      ? ` • Nota: "${created.customerNotes.slice(0, 60)}"`
      : "";

    const staffUserId = created.staff?.userId;
    if (staffUserId && staffUserId !== customerId) {
      await createIdempotentNotificationInTx(tx, {
        userId: staffUserId,
        appointmentId: created.id,
        eventKey: `apt:${created.id}:created:v0:user:${staffUserId}`,
        type: "NEW_APPOINTMENT",
        title: `Nueva cita a las ${time} (${serviceLabel})`,
        message: `${customerLabel} reservó ${serviceLabel} para el ${date} a las ${time}.`,
      });
    }

    const staffRecipients = await resolveStaffRecipientUserIdsInTx(
      tx,
      staffUserId,
      customerId
    );
    if (staffRecipients.length > 0) {
      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${created.id}:created:v0`,
        eventType: "APPOINTMENT_CREATED",
        appointmentId: created.id,
        recipientUserIds: staffRecipients,
        actorUserId: customerId,
        title: hidePushDetails
          ? "Nueva cita registrada"
          : `📅 Nueva cita: ${serviceLabel} (${time})`,
        body: hidePushDetails
          ? "Tienes una nueva reserva en tu agenda. Toca para ver los detalles."
          : `${customerLabel} agendó ${serviceLabel} con ${staffLabel} para el ${dateFormatted} a las ${time}.${noteSnippet}`,
        targetPath: `/admin?tab=agenda&date=${encodeURIComponent(date)}&appointmentId=${encodeURIComponent(created.id)}`,
        tag: `apt-new-${created.id}`,
      });
    }

    return created;
  });

  emitRealtimeEvent({
    type: "APPOINTMENT_CREATED",
    appointmentId: newAppointment.id,
    staffId: newAppointment.staffId,
    customerId: newAppointment.customerId,
    actorUserId: customerId,
    customerName: newAppointment.customer?.name || "Cliente",
    serviceName: newAppointment.service?.name || "Servicio",
    staffName: newAppointment.staff?.displayName || "Profesional",
    reason: newAppointment.customerNotes || undefined,
    startAt: newAppointment.startAt.toISOString(),
    eventKey: `apt:${newAppointment.id}:created:v0`,
    hasLinkedStaffUser: Boolean(newAppointment.staff?.userId),
  });

  void dispatchPendingPushDeliveries().catch((err) => {
    console.error("[WebPush] Appointment created dispatch error:", err);
  });

  return sanitizeAppointmentForClient(newAppointment, viewerRole);
}

export async function createStaffWalkInAppointment(params: {
  actorUser: { id: string; role: string; name?: string | null };
  staffId: string;
  serviceId: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerNotes?: string | null;
  allowOverbooking?: boolean;
}) {
  const {
    actorUser,
    staffId,
    serviceId,
    date,
    time,
    customerName,
    customerPhone,
    customerEmail,
    customerNotes,
    allowOverbooking = false,
  } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new BookingConflictError(
      "Formato de fecha (YYYY-MM-DD) u hora (HH:mm) inválido.",
      400
    );
  }

  const cleanName = customerName.trim().slice(0, 100);
  if (cleanName.length < 2) {
    throw new BookingConflictError(
      "Ingresa el nombre completo del cliente/paciente (mínimo 2 caracteres).",
      400
    );
  }

  const rawPhone = customerPhone.trim().slice(0, 40);
  const phoneDigits = rawPhone.replace(/\D/g, "");
  if (phoneDigits.length < 8 || phoneDigits.length > 15) {
    throw new BookingConflictError(
      "Ingresa un teléfono / WhatsApp válido (8 a 15 dígitos).",
      400
    );
  }

  const cleanEmail = customerEmail ? normalizeEmail(customerEmail) : "";
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new BookingConflictError(
      "El correo electrónico proporcionado no es válido.",
      400
    );
  }

  const startMin = timeToMinutes(time);
  if (startMin === -1) {
    throw new BookingConflictError("Hora de inicio inválida.", 400);
  }

  const placeholderPasswordHash = await bcrypt.hash(
    randomBytes(12).toString("base64url"),
    10
  );

  const created = await withImmediateLock(async (tx) => {
    const settings = await tx.businessSettings.findFirst({ where: { id: 1 } });
    const businessTz = resolveBusinessTimeZone(settings?.timezone);
    const hidePushDetails = Boolean(settings?.pushHideDetails);

    const staffProfile = await tx.staffProfile.findUnique({
      where: { id: staffId },
      include: { workingShifts: true },
    });
    if (!staffProfile) {
      throw new BookingConflictError("Profesional no encontrado.", 404);
    }

    if (actorUser.role === "PROVIDER" && staffProfile.userId !== actorUser.id) {
      throw new BookingConflictError(
        "Solo puedes agendar citas presenciales/telefónicas en tu propia agenda.",
        403
      );
    }

    if (!allowOverbooking && !staffProfile.isActive) {
      throw new BookingConflictError(
        "El profesional tiene la agenda pausada. Activa 'Permitir sobrecupo' si deseas agendar igualmente.",
        409
      );
    }

    const service = await tx.service.findUnique({ where: { id: serviceId } });
    if (!service || (!service.isActive && actorUser.role !== "ADMIN")) {
      throw new BookingConflictError("Servicio no encontrado o inactivo.", 404);
    }

    const startAt = parseDateAndTime(date, time, businessTz);
    if (isNaN(startAt.getTime())) {
      throw new BookingConflictError("Fecha u hora inválida.", 400);
    }
    const totalDurationMin = service.durationMin + service.bufferAfterMin;
    const endAt = new Date(startAt.getTime() + totalDurationMin * 60_000);

    const dayOfWeek = getDayOfWeekInTz(date, businessTz);

    if (!allowOverbooking) {
      const endMin = startMin + totalDurationMin;
      const fitsInShift = staffProfile.workingShifts.some((sh) => {
        if (sh.dayOfWeek !== dayOfWeek) return false;
        const shStart = timeToMinutes(sh.startTime);
        const shEnd = timeToMinutes(sh.endTime);
        return shStart !== -1 && shEnd !== -1 && startMin >= shStart && endMin <= shEnd;
      });
      if (!fitsInShift) {
        throw new BookingConflictError(
          "El horario cae fuera del turno habitual del profesional. Marca 'Permitir sobrecupo / fuera de turno' para forzarlo.",
          409
        );
      }

      const [overlappingApt, overlappingTimeOff] = await Promise.all([
        tx.appointment.findFirst({
          where: {
            staffId,
            status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { id: true },
        }),
        tx.timeOff.findFirst({
          where: {
            staffId,
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
          select: { id: true },
        }),
      ]);

      if (overlappingTimeOff) {
        throw new BookingConflictError(
          "Existe un bloqueo horario o vacaciones en ese rango. Marca 'Permitir sobrecupo' para sobrescribir.",
          409
        );
      }
      if (overlappingApt) {
        throw new BookingConflictError(
          "Ya existe otra cita activa que se cruza con ese horario. Marca 'Permitir sobrecupo' para agendar en paralelo.",
          409
        );
      }
    }

    // Resolve or provision customer record cleanly
    let customer = cleanEmail
      ? await tx.user.findUnique({ where: { email: cleanEmail } })
      : await tx.user.findFirst({
          where: { role: "CUSTOMER", phone: rawPhone },
        });

    if (customer) {
      if (customer.role === "PROVIDER") {
        throw new BookingConflictError(
          "Ese correo pertenece a una cuenta profesional (Doctor/Especialista). Usa un correo de cliente o deja el campo vacío.",
          400
        );
      }
      if (!customer.phone) {
        customer = await tx.user.update({
          where: { id: customer.id },
          data: { phone: rawPhone },
        });
      }
    } else {
      const syntheticEmail =
        cleanEmail ||
        `walkin.${phoneDigits}.${randomBytes(3).toString("hex")}@local.invalid`;
      customer = await tx.user.create({
        data: {
          name: cleanName,
          email: syntheticEmail,
          phone: rawPhone,
          passwordHash: placeholderPasswordHash,
          role: "CUSTOMER",
        },
      });
    }

    const createdApt = await tx.appointment.create({
      data: {
        customerId: customer.id,
        staffId,
        serviceId,
        startAt,
        endAt,
        status: "CONFIRMED",
        isOverbooking: Boolean(allowOverbooking),
        priceSnapshot: service.price,
        customerNotes:
          typeof customerNotes === "string" && customerNotes.trim()
            ? customerNotes.trim().slice(0, 500)
            : null,
      },
      include: {
        service: true,
        staff: true,
        customer: { select: { name: true, email: true } },
      },
    });

    const dateFormatted = formatSpanishDateInTz(startAt, businessTz);
    const serviceLabel = createdApt.service?.name || "Servicio";
    const staffLabel = createdApt.staff?.displayName || "Profesional";

    if (!customer.email.endsWith("@local.invalid") && customer.id !== actorUser.id) {
      await createIdempotentNotificationInTx(tx, {
        userId: customer.id,
        appointmentId: createdApt.id,
        eventKey: `apt:${createdApt.id}:walkin:user:${customer.id}`,
        type: "NEW_APPOINTMENT",
        title: `Cita agendada: ${serviceLabel} (${time})`,
        message: `Se registró tu cita de ${serviceLabel} con ${staffLabel} para el ${dateFormatted} a las ${time}.`,
      });

      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${createdApt.id}:walkin:cust`,
        eventType: "APPOINTMENT_CREATED",
        appointmentId: createdApt.id,
        recipientUserIds: [customer.id],
        actorUserId: actorUser.id,
        title: hidePushDetails
          ? "Nueva cita confirmada"
          : `📅 Cita agendada: ${serviceLabel} (${time})`,
        body: hidePushDetails
          ? "Se registró una cita en tu agenda. Toca para ver los detalles."
          : `${staffLabel} registró tu cita para el ${dateFormatted} a las ${time}.`,
        targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(createdApt.id)}`,
        tag: `apt-new-${createdApt.id}`,
      });
    }

    const staffRecipients = await resolveStaffRecipientUserIdsInTx(
      tx,
      createdApt.staff?.userId,
      actorUser.id
    );
    if (staffRecipients.length > 0) {
      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${createdApt.id}:walkin:staff`,
        eventType: "APPOINTMENT_CREATED",
        appointmentId: createdApt.id,
        recipientUserIds: staffRecipients,
        actorUserId: actorUser.id,
        title: hidePushDetails
          ? "Nueva cita presencial registrada"
          : `📅 Walk-in: ${serviceLabel} (${time})`,
        body: hidePushDetails
          ? "Se registró una cita presencial o telefónica en tu agenda."
          : `${cleanName} agendado con ${staffLabel} el ${dateFormatted} a las ${time}.`,
        targetPath: `/admin?tab=agenda&date=${encodeURIComponent(date)}&appointmentId=${encodeURIComponent(createdApt.id)}`,
        tag: `apt-new-${createdApt.id}`,
      });
    }

    return createdApt;
  });

  emitRealtimeEvent({
    type: "APPOINTMENT_CREATED",
    appointmentId: created.id,
    staffId: created.staffId,
    customerId: created.customerId,
    actorUserId: actorUser.id,
    customerName: created.customer?.name || cleanName,
    serviceName: created.service?.name || "Servicio",
    staffName: created.staff?.displayName || "Profesional",
    reason: created.customerNotes || undefined,
    startAt: created.startAt.toISOString(),
    eventKey: `apt:${created.id}:walkin:v0`,
    hasLinkedStaffUser: Boolean(created.staff?.userId),
  });

  void dispatchPendingPushDeliveries().catch((err) => {
    console.error("[WebPush] Walk-in created dispatch error:", err);
  });

  return sanitizeAppointmentForClient(created, actorUser.role);
}

export async function rescheduleAppointment(params: {
  appointmentId: string;
  actorUser: { id: string; role: string; name?: string | null };
  newDate: string;
  newTime: string;
  newStaffId?: string;
  reason?: string | null;
  allowOverbooking?: boolean;
}) {
  const {
    appointmentId,
    actorUser,
    newDate,
    newTime,
    newStaffId,
    reason,
    allowOverbooking = false,
  } = params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
    throw new BookingConflictError(
      "Formato de fecha (YYYY-MM-DD) u hora (HH:mm) inválido.",
      400
    );
  }

  const isStaffActor = actorUser.role === "ADMIN" || actorUser.role === "PROVIDER";
  const cleanReason =
    typeof reason === "string" && reason.trim()
      ? reason.trim().slice(0, 240)
      : null;

  const outcome = await withImmediateLock(async (tx) => {
    const now = new Date();
    const settings = await tx.businessSettings.findFirst({ where: { id: 1 } });
    const businessTz = resolveBusinessTimeZone(settings?.timezone);
    const hidePushDetails = Boolean(settings?.pushHideDetails);
    const slotStep = settings?.slotStepMin ?? 30;
    const minCancelHours = settings?.minCancelNoticeHours ?? 6;

    const existing = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        service: true,
        staff: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!existing) {
      throw new BookingConflictError("Cita no encontrada.", 404);
    }

    if (!isActiveBookingStatus(existing.status)) {
      throw new BookingConflictError(
        "Solo se pueden reprogramar citas activas.",
        409
      );
    }

    const totalDurationMin =
      existing.service.durationMin + existing.service.bufferAfterMin;
    const newStartAt = parseDateAndTime(newDate, newTime, businessTz);
    if (isNaN(newStartAt.getTime())) {
      throw new BookingConflictError("Fecha u hora inválida.", 400);
    }
    const newEndAt = new Date(newStartAt.getTime() + totalDurationMin * 60_000);

    const todayStr = formatLocalDateYYYYMMDD(now, businessTz);
    const diffDays = diffDaysYYYYMMDD(newDate, todayStr);
    if (Number.isNaN(diffDays) || diffDays < 0) {
      throw new BookingConflictError(
        "No es posible reprogramar hacia fechas pasadas.",
        400
      );
    }

    const { startOfDay, endOfDay } = getDayBoundsInTz(newDate, businessTz);
    const dayOfWeek = getDayOfWeekInTz(newDate, businessTz);
    const nextMorning = new Date(endOfDay.getTime() + 6 * 60 * 60 * 1000);

    if (!isStaffActor) {
      if (existing.customerId !== actorUser.id) {
        throw new BookingConflictError(
          "No tienes permiso para reprogramar esta cita.",
          403
        );
      }

      if (newStartAt.getTime() <= now.getTime()) {
        throw new BookingConflictError(
          "El nuevo horario debe ser posterior al momento actual.",
          400
        );
      }

      const policyCheck = canCustomerRescheduleAppointment(
        existing,
        minCancelHours,
        2,
        now
      );
      if (!policyCheck.allowed) {
        throw new BookingConflictError(
          policyCheck.reason || "No es posible reprogramar esta cita.",
          409
        );
      }

      const selfOverlap = await tx.appointment.findFirst({
        where: {
          customerId: actorUser.id,
          id: { not: existing.id },
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
          startAt: { lt: newEndAt },
          endAt: { gt: newStartAt },
        },
        select: { id: true },
      });
      if (selfOverlap) {
        throw new BookingConflictError(
          "Ya tienes otra cita activa que se cruza con ese nuevo horario.",
          409
        );
      }

      const requestedStaffId =
        newStaffId && newStaffId.trim() ? newStaffId.trim() : existing.staffId;

      const verifyCandidate = async (candidateId: string) => {
        const sp = await tx.staffProfile.findUnique({ where: { id: candidateId } });
        if (!sp || !sp.isActive) return false;
        const staffHorizon = sp.customHorizonDays ?? settings?.bookingHorizonDays ?? 7;
        if (diffDays > staffHorizon) return false;
        const staffLead = sp.customLeadTimeMin ?? settings?.minLeadTimeMinutes ?? 30;

        const [shifts, timeOffs, appointments] = await Promise.all([
          tx.workingShift.findMany({ where: { staffId: candidateId, dayOfWeek } }),
          tx.timeOff.findMany({
            where: {
              staffId: candidateId,
              startAt: { lte: nextMorning },
              endAt: { gte: new Date(startOfDay.getTime() - 12 * 3600_000) },
            },
          }),
          tx.appointment.findMany({
            where: {
              staffId: candidateId,
              id: { not: existing.id },
              startAt: { lte: nextMorning },
              endAt: { gte: startOfDay },
              status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            },
          }),
        ]);

        const slots = computeAvailableSlotsForStaff({
          dateStr: newDate,
          shifts,
          timeOffs,
          appointments,
          serviceDuration: totalDurationMin,
          slotStepMin: slotStep,
          leadTimeMin: staffLead,
          now,
          timeZone: businessTz,
        });
        return slots.includes(newTime);
      };

      let chosenStaffId: string | null = null;
      if (requestedStaffId === "ANY") {
        const eligible = await tx.staffService.findMany({
          where: { serviceId: existing.serviceId, staff: { isActive: true } },
          include: { staff: true },
          orderBy: { staff: { sortOrder: "asc" } },
        });
        for (const item of eligible) {
          if (await verifyCandidate(item.staffId)) {
            chosenStaffId = item.staffId;
            break;
          }
        }
      } else {
        const assigned = await tx.staffService.findUnique({
          where: {
            staffId_serviceId: {
              staffId: requestedStaffId,
              serviceId: existing.serviceId,
            },
          },
        });
        if (!assigned) {
          throw new BookingConflictError(
            "El profesional seleccionado no realiza este servicio.",
            400
          );
        }
        if (await verifyCandidate(requestedStaffId)) {
          chosenStaffId = requestedStaffId;
        }
      }

      if (!chosenStaffId) {
        throw new BookingConflictError(
          "El nuevo horario ya no está disponible. Elige otro horario libre.",
          409
        );
      }

      const nextVersion = existing.rescheduleVersion + 1;
      const updated = await tx.appointment.update({
        where: { id: existing.id },
        data: {
          staffId: chosenStaffId,
          startAt: newStartAt,
          endAt: newEndAt,
          previousStartAt: existing.startAt,
          status: "CONFIRMED",
          allowFreeCancel: false,
          isOverbooking: false,
          rescheduleVersion: nextVersion,
          customerRescheduleCount: { increment: 1 },
          reminder24hSentAt: null,
          reminder2hSentAt: null,
        },
        include: {
          service: true,
          staff: true,
          customer: { select: { name: true, email: true } },
        },
      });

      const oldTime = formatSpanishTimeInTz(existing.startAt, businessTz);
      const newDateLabel = formatSpanishDateInTz(newStartAt, businessTz);
      const svcLabel = updated.service?.name || "Servicio";
      const custLabel = updated.customer?.name || "El cliente";

      const staffUserId = updated.staff?.userId;
      if (staffUserId && staffUserId !== actorUser.id) {
        await createIdempotentNotificationInTx(tx, {
          userId: staffUserId,
          appointmentId: updated.id,
          eventKey: `apt:${updated.id}:cust-resched:v${nextVersion}:user:${staffUserId}`,
          type: "APPOINTMENT_RESCHEDULED",
          title: `Cita reprogramada para el ${newDateLabel} (${newTime})`,
          message: `${custLabel} movió ${svcLabel} (antes ${oldTime}) al ${newDateLabel} a las ${newTime}.`,
        });
      }

      const staffRecipients = await resolveStaffRecipientUserIdsInTx(
        tx,
        staffUserId,
        actorUser.id
      );
      if (staffRecipients.length > 0) {
        await enqueuePushDeliveriesInTx(tx, {
          eventKey: `apt:${updated.id}:cust-resched:v${nextVersion}`,
          eventType: "APPOINTMENT_RESCHEDULED",
          appointmentId: updated.id,
          recipientUserIds: staffRecipients,
          actorUserId: actorUser.id,
          title: hidePushDetails
            ? "Cita reprogramada por paciente"
            : `🔄 Reprogramada: ${svcLabel} (${newTime})`,
          body: hidePushDetails
            ? "Un cliente reprogramó su cita. Toca para ver los detalles."
            : `${custLabel} movió su cita al ${newDateLabel} a las ${newTime} (antes ${oldTime}).`,
          targetPath: `/admin?tab=agenda&date=${encodeURIComponent(newDate)}&appointmentId=${encodeURIComponent(updated.id)}`,
          tag: `apt-resched-${updated.id}-v${nextVersion}`,
        });
      }

      return { updated, previousStartAt: existing.startAt, previousStaffId: existing.staffId };
    }

    // Staff / Admin rescheduling branch
    if (actorUser.role === "PROVIDER" && existing.staff?.userId !== actorUser.id) {
      throw new BookingConflictError(
        "Solo puedes reprogramar citas de tu propia agenda.",
        403
      );
    }

    const targetStaffId =
      newStaffId && newStaffId !== "ANY" && actorUser.role === "ADMIN"
        ? newStaffId
        : existing.staffId;

    const targetStaff = await tx.staffProfile.findUnique({
      where: { id: targetStaffId },
    });
    if (!targetStaff) {
      throw new BookingConflictError("Profesional destino no encontrado.", 404);
    }
    if (!allowOverbooking && !targetStaff.isActive) {
      throw new BookingConflictError(
        "El profesional destino está pausado. Activa 'Permitir sobrecupo' si deseas mover la cita.",
        409
      );
    }

    if (!allowOverbooking) {
      const [conflictApt, conflictTimeOff] = await Promise.all([
        tx.appointment.findFirst({
          where: {
            staffId: targetStaffId,
            id: { not: existing.id },
            status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            startAt: { lt: newEndAt },
            endAt: { gt: newStartAt },
          },
          select: { id: true },
        }),
        tx.timeOff.findFirst({
          where: {
            staffId: targetStaffId,
            startAt: { lt: newEndAt },
            endAt: { gt: newStartAt },
          },
          select: { id: true },
        }),
      ]);
      if (conflictTimeOff) {
        throw new BookingConflictError(
          "El horario elegido tiene un bloqueo / vacaciones activas.",
          409
        );
      }
      if (conflictApt) {
        throw new BookingConflictError(
          "Ya existe otra cita activa en ese horario. Activa 'Permitir sobrecupo' para moverla igualmente.",
          409
        );
      }
    }

    const nextVersion = existing.rescheduleVersion + 1;
    const moveReason = cleanReason || "Reprogramada por el establecimiento";
    const updated = await tx.appointment.update({
      where: { id: existing.id },
      data: {
        staffId: targetStaffId,
        startAt: newStartAt,
        endAt: newEndAt,
        previousStartAt: existing.startAt,
        status: "RESCHEDULED_BY_STAFF",
        allowFreeCancel: true,
        staffMoveReason: moveReason,
        isOverbooking: Boolean(allowOverbooking) || existing.isOverbooking,
        rescheduleVersion: nextVersion,
        reminder24hSentAt: null,
        reminder2hSentAt: null,
      },
      include: {
        service: true,
        staff: true,
        customer: { select: { name: true, email: true } },
      },
    });

    const oldTime = formatSpanishTimeInTz(existing.startAt, businessTz);
    const newDateLabel = formatSpanishDateInTz(newStartAt, businessTz);
    const svcLabel = updated.service?.name || "Servicio";
    const staffLabel = updated.staff?.displayName || "Profesional";

    if (
      updated.customerId !== actorUser.id &&
      !updated.customer?.email?.endsWith("@local.invalid")
    ) {
      await createIdempotentNotificationInTx(tx, {
        userId: updated.customerId,
        appointmentId: updated.id,
        eventKey: `apt:${updated.id}:staff-resched:v${nextVersion}:user:${updated.customerId}`,
        type: "APPOINTMENT_RESCHEDULED",
        title: `Horario actualizado: ${svcLabel} (${newTime})`,
        message: `${staffLabel} reprogramó tu cita (antes ${oldTime}) para el ${newDateLabel} a las ${newTime}. Motivo: ${moveReason}.`,
      });

      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${updated.id}:staff-resched:v${nextVersion}`,
        eventType: "APPOINTMENT_RESCHEDULED",
        appointmentId: updated.id,
        recipientUserIds: [updated.customerId],
        actorUserId: actorUser.id,
        title: hidePushDetails
          ? "Actualización en tu cita"
          : `🕒 Nuevo horario: ${svcLabel} (${newTime})`,
        body: hidePushDetails
          ? "El establecimiento actualizó el horario de tu cita. Toca para confirmar."
          : `${staffLabel} movió tu cita al ${newDateLabel} a las ${newTime} (antes ${oldTime}).`,
        targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(updated.id)}`,
        tag: `apt-move-${updated.id}-v${nextVersion}`,
      });
    }

    return { updated, previousStartAt: existing.startAt, previousStaffId: existing.staffId };
  });

  emitRealtimeEvent({
    type: "APPOINTMENT_UPDATED",
    appointmentId: outcome.updated.id,
    staffId: outcome.updated.staffId,
    customerId: outcome.updated.customerId,
    actorUserId: actorUser.id,
    customerName: outcome.updated.customer?.name || "Cliente",
    serviceName: outcome.updated.service?.name || "Servicio",
    staffName: outcome.updated.staff?.displayName || "Profesional",
    status: outcome.updated.status,
    reason: outcome.updated.staffMoveReason || undefined,
    startAt: outcome.updated.startAt.toISOString(),
    previousStartAt: outcome.previousStartAt.toISOString(),
    eventKey: `apt:${outcome.updated.id}:resched:v${outcome.updated.rescheduleVersion}`,
    hasLinkedStaffUser: Boolean(outcome.updated.staff?.userId),
  });

  void dispatchPendingPushDeliveries().catch((err) => {
    console.error("[WebPush] Reschedule dispatch error:", err);
  });

  return sanitizeAppointmentForClient(outcome.updated, actorUser.role);
}
