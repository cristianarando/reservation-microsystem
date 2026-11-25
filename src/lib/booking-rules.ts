// src/lib/booking-rules.ts

export interface AppointmentCheckable {
  id: string;
  startAt: Date | string;
  endAt: Date | string;
  status: string;
  allowFreeCancel: boolean;
  staffMoveReason?: string | null;
  customerRescheduleCount?: number;
}

export const MAX_CUSTOMER_RESCHEDULES = 2;

const ACTIVE_BOOKING_STATUSES = new Set(["CONFIRMED", "RESCHEDULED_BY_STAFF"]);

export function isActiveBookingStatus(status: string): boolean {
  return ACTIVE_BOOKING_STATUSES.has(status);
}

/**
 * Active reservations only count from present/in-progress to the future (endAt > now),
 * so past appointments never consume customer quota even if staff forgot to tick them.
 */
export function isUpcomingActiveAppointment(
  appointment: Pick<AppointmentCheckable, "status" | "startAt" | "endAt">,
  now = new Date()
): boolean {
  if (!isActiveBookingStatus(appointment.status)) return false;
  const endMs = new Date(appointment.endAt || appointment.startAt).getTime();
  return !Number.isNaN(endMs) && endMs > now.getTime();
}

export function isPastUntickedAppointment(
  appointment: Pick<AppointmentCheckable, "status" | "startAt" | "endAt">,
  now = new Date()
): boolean {
  if (!isActiveBookingStatus(appointment.status)) return false;
  const endMs = new Date(appointment.endAt || appointment.startAt).getTime();
  return !Number.isNaN(endMs) && endMs <= now.getTime();
}

export function canCustomerCancelAppointment(
  appointment: AppointmentCheckable,
  minCancelNoticeHours: number,
  now = new Date()
): { allowed: boolean; reason?: string; isFreeCancellationBecauseOfStaff?: boolean } {
  if (appointment.status === "CANCELLED") {
    return { allowed: false, reason: "La cita ya se encuentra cancelada." };
  }
  if (appointment.status === "COMPLETED") {
    return { allowed: false, reason: "La cita ya fue completada." };
  }
  if (appointment.status === "NO_SHOW" || appointment.status === "NO_SHOW_ARCHIVED") {
    return { allowed: false, reason: "Esta cita figura como inasistencia y no puede cancelarse." };
  }

  const nowMs = now.getTime();
  const endMs = new Date(appointment.endAt || appointment.startAt).getTime();
  if (!Number.isNaN(endMs) && endMs <= nowMs) {
    return { allowed: false, reason: "Esta cita ya finalizó y pasó a tu historial." };
  }

  // KEY EXCEPTION: If the specialist rescheduled the appointment due to an unforeseen event, customer can ALWAYS cancel for free
  if (appointment.allowFreeCancel || appointment.status === "RESCHEDULED_BY_STAFF") {
    return {
      allowed: true,
      isFreeCancellationBecauseOfStaff: true,
    };
  }

  const startMs = new Date(appointment.startAt).getTime();
  const hoursRemaining = (startMs - nowMs) / (1000 * 60 * 60);

  if (hoursRemaining < minCancelNoticeHours) {
    return {
      allowed: false,
      reason: `No es posible cancelar con menos de ${minCancelNoticeHours} horas de anticipación. Por favor comunícate directamente por WhatsApp si tienes una urgencia.`,
    };
  }

  return { allowed: true };
}

export function canCustomerRescheduleAppointment(
  appointment: AppointmentCheckable,
  minCancelNoticeHours: number,
  maxReschedules = MAX_CUSTOMER_RESCHEDULES,
  now = new Date()
): { allowed: boolean; reason?: string; remainingReschedules: number } {
  const used = appointment.customerRescheduleCount ?? 0;
  const remainingReschedules = Math.max(0, maxReschedules - used);

  if (!isActiveBookingStatus(appointment.status)) {
    return {
      allowed: false,
      reason: "Solo se pueden reprogramar citas activas.",
      remainingReschedules,
    };
  }

  const nowMs = now.getTime();
  const endMs = new Date(appointment.endAt || appointment.startAt).getTime();
  if (!Number.isNaN(endMs) && endMs <= nowMs) {
    return {
      allowed: false,
      reason: "Esta cita ya finalizó y no puede reprogramarse.",
      remainingReschedules,
    };
  }

  if (remainingReschedules <= 0) {
    return {
      allowed: false,
      reason: `Alcanzaste el límite de ${maxReschedules} reprogramaciones en línea para esta cita. Escríbenos por WhatsApp si necesitas un cambio adicional.`,
      remainingReschedules: 0,
    };
  }

  if (!appointment.allowFreeCancel && appointment.status !== "RESCHEDULED_BY_STAFF") {
    const startMs = new Date(appointment.startAt).getTime();
    const hoursRemaining = (startMs - nowMs) / (1000 * 60 * 60);
    if (hoursRemaining < minCancelNoticeHours) {
      return {
        allowed: false,
        reason: `No es posible reprogramar con menos de ${minCancelNoticeHours} horas de anticipación. Comunícate por WhatsApp si tienes una urgencia.`,
        remainingReschedules,
      };
    }
  }

  return { allowed: true, remainingReschedules };
}

export function findConflictingAppointments(
  appointments: AppointmentCheckable[],
  blockStart: Date,
  blockEnd: Date
): AppointmentCheckable[] {
  const bStart = blockStart.getTime();
  const bEnd = blockEnd.getTime();

  return appointments.filter((apt) => {
    if (!isActiveBookingStatus(apt.status)) return false;
    const aStart = new Date(apt.startAt).getTime();
    const aEnd = new Date(apt.endAt).getTime();
    return aStart < bEnd && aEnd > bStart;
  });
}
