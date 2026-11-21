// src/lib/appointment-lifecycle.ts
import { Prisma } from "@prisma/client";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { RealtimeEventPayload } from "@/lib/realtime-events";
import { enqueuePushDeliveriesInTx } from "@/lib/web-push";

export const ALLOWED_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  CONFIRMED: [
    "CONFIRMED",
    "RESCHEDULED_BY_STAFF",
    "COMPLETED",
    "NO_SHOW",
    "CANCELLED",
  ],
  RESCHEDULED_BY_STAFF: [
    "RESCHEDULED_BY_STAFF",
    "CONFIRMED",
    "COMPLETED",
    "NO_SHOW",
    "CANCELLED",
  ],
  COMPLETED: [
    "COMPLETED",
    "CONFIRMED",
    "NO_SHOW",
    "CANCELLED",
  ],
  NO_SHOW: [
    "NO_SHOW",
    "CONFIRMED",
    "COMPLETED",
    "CANCELLED",
  ],
  // Cancelled appointments can only be reactivated to CONFIRMED or RESCHEDULED_BY_STAFF (after slot re-validation)
  CANCELLED: [
    "CANCELLED",
    "CONFIRMED",
    "RESCHEDULED_BY_STAFF",
  ],
  NO_SHOW_ARCHIVED: ["NO_SHOW_ARCHIVED"],
};

export function validateAppointmentStatusTransition(
  previousStatus: string,
  nextStatus: string
): {
  allowed: boolean;
  idempotent: boolean;
  requiresSlotRevalidation: boolean;
  error?: string;
} {
  if (previousStatus === nextStatus) {
    return {
      allowed: true,
      idempotent: true,
      requiresSlotRevalidation: false,
    };
  }

  if (previousStatus === "NO_SHOW_ARCHIVED") {
    return {
      allowed: false,
      idempotent: false,
      requiresSlotRevalidation: false,
      error:
        "Las inasistencias archivadas pertenecen a un ciclo anterior y no pueden modificarse.",
    };
  }

  const allowedTargets = ALLOWED_STATUS_TRANSITIONS[previousStatus];
  if (!allowedTargets || !allowedTargets.includes(nextStatus)) {
    if (
      previousStatus === "CANCELLED" &&
      (nextStatus === "COMPLETED" || nextStatus === "NO_SHOW")
    ) {
      return {
        allowed: false,
        idempotent: false,
        requiresSlotRevalidation: false,
        error:
          "No se puede marcar como atendida o inasistencia una cita cancelada. Reactívala primero a confirmada si el horario sigue disponible.",
      };
    }
    return {
      allowed: false,
      idempotent: false,
      requiresSlotRevalidation: false,
      error: `Transición de estado no permitida (${previousStatus} -> ${nextStatus}).`,
    };
  }

  const wasOccupyingSlot =
    previousStatus === "CONFIRMED" || previousStatus === "RESCHEDULED_BY_STAFF";
  const willOccupySlot =
    nextStatus === "CONFIRMED" || nextStatus === "RESCHEDULED_BY_STAFF";

  return {
    allowed: true,
    idempotent: false,
    requiresSlotRevalidation: !wasOccupyingSlot && willOccupySlot,
  };
}

/**
 * Creates an internal Notification only if no notification with the same `eventKey` exists yet.
 */
export async function createIdempotentNotificationInTx(
  tx: Prisma.TransactionClient,
  data: {
    userId: string;
    appointmentId?: string | null;
    eventKey: string;
    type: string;
    title: string;
    message: string;
  }
) {
  const existing = await tx.notification.findFirst({
    where: { eventKey: data.eventKey },
  });
  if (existing) return existing;

  return tx.notification.create({
    data: {
      userId: data.userId,
      appointmentId: data.appointmentId ?? null,
      eventKey: data.eventKey,
      type: data.type,
      title: data.title,
      message: data.message,
      isRead: false,
    },
  });
}

/**
 * Resolves staff notification recipient user IDs:
 * - The linked `staffUserId` of the assigned `StaffProfile` (if any)
 * - Any `ADMIN` user who explicitly enabled `notifyAllStaff: true`
 */
export async function resolveStaffRecipientUserIdsInTx(
  tx: Prisma.TransactionClient,
  staffUserId: string | null | undefined,
  actorUserId?: string | null
): Promise<string[]> {
  const recipients = new Set<string>();
  if (staffUserId && staffUserId !== actorUserId) {
    recipients.add(staffUserId);
  }

  const globalAdmins = await tx.user.findMany({
    where: {
      role: "ADMIN",
      OR: [
        { notifyAllStaff: true },
        { staffProfile: { is: null } },
        ...(!staffUserId ? [{}] : []),
      ],
    },
    select: { id: true },
  });

  for (const adm of globalAdmins) {
    if (adm.id !== actorUserId) {
      recipients.add(adm.id);
    }
  }

  return Array.from(recipients);
}

/**
 * Unified transactional appointment cancellation logic shared across:
 * - POST /api/appointments/[id]/cancel (Customer or Staff/Admin)
 * - PUT /api/admin/appointments/[id]/status (Staff/Admin setting status="CANCELLED")
 * - POST /api/admin/day-override (Staff/Admin mass closure with resolution="CANCEL_ALL")
 */
export async function cancelAppointmentInTx(
  tx: Prisma.TransactionClient,
  params: {
    appointmentId: string;
    actorUser: { id: string; role: string; name?: string | null };
    reason?: string;
    isMassClosure?: boolean;
  }
): Promise<{
  appointment: Prisma.AppointmentGetPayload<{
    include: { customer: true; service: true; staff: true };
  }>;
  alreadyCancelled: boolean;
  realtimeEvent: RealtimeEventPayload | null;
}> {
  const current = await tx.appointment.findUnique({
    where: { id: params.appointmentId },
    include: {
      customer: true,
      service: true,
      staff: true,
    },
  });

  if (!current) {
    throw new Error("APPOINTMENT_NOT_FOUND");
  }

  const isStaffOrAdmin =
    params.actorUser.role === "ADMIN" || params.actorUser.role === "PROVIDER";
  const cancelledByTag: "STAFF" | "CUSTOMER" = isStaffOrAdmin
    ? "STAFF"
    : "CUSTOMER";

  // Idempotent guard: if already CANCELLED, do not re-create notifications or push deliveries
  if (current.status === "CANCELLED") {
    return {
      appointment: current,
      alreadyCancelled: true,
      realtimeEvent: null,
    };
  }

  const cleanReason =
    typeof params.reason === "string" && params.reason.trim()
      ? params.reason.trim().slice(0, 300)
      : undefined;

  const effectiveStaffReason = isStaffOrAdmin
    ? cleanReason || "Cancelada por el profesional / imprevisto de agenda"
    : null;

  const updateRes = await tx.appointment.updateMany({
    where: {
      id: current.id,
      status: current.status,
    },
    data: {
      status: "CANCELLED",
      cancelledBy: cancelledByTag,
      cancelledByUserId: params.actorUser.id,
      staffMoveReason: effectiveStaffReason,
    },
  });

  if (updateRes.count === 0) {
    const reloaded = await tx.appointment.findUnique({
      where: { id: current.id },
      include: { customer: true, service: true, staff: true },
    });
    return {
      appointment: reloaded || current,
      alreadyCancelled: true,
      realtimeEvent: null,
    };
  }

  const updated = await tx.appointment.findUniqueOrThrow({
    where: { id: current.id },
    include: { customer: true, service: true, staff: true },
  });

  const aptDate = new Date(current.startAt);
  const timeFormatted = aptDate.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFormatted = aptDate.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  const dateShort = aptDate.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const dateYmd = formatLocalDateYYYYMMDD(aptDate);
  const serviceName = current.service?.name || "Servicio";
  const staffName = current.staff?.displayName || "el profesional";
  const customerName = current.customer?.name || "Un cliente";

  if (isStaffOrAdmin) {
    // Business / Staff cancelled: notify the customer owner (unless self-action)
    if (current.customerId !== params.actorUser.id) {
      const notifEventKey = `apt:${current.id}:cancelled_by_staff:v${current.rescheduleVersion}:user:${current.customerId}`;
      const notif = await createIdempotentNotificationInTx(tx, {
        userId: current.customerId,
        appointmentId: current.id,
        eventKey: notifEventKey,
        type: "APPOINTMENT_CANCELLED",
        title: `Se canceló tu cita de las ${timeFormatted} (${serviceName})`,
        message: `Tu cita de ${serviceName} del ${dateFormatted} a las ${timeFormatted} con ${staffName} fue cancelada: "${
          cleanReason || "Imprevisto de agenda"
        }". Puedes agendar un nuevo horario cuando desees.`,
      });

      // For single cancellation, enqueue individual Web Push immediately.
      // For mass closure (day-override CANCEL_ALL), the caller enqueues a consolidated per-customer push.
      if (!params.isMassClosure) {
        await enqueuePushDeliveriesInTx(tx, {
          eventKey: `apt:${current.id}:cancelled_by_staff:v${current.rescheduleVersion}`,
          eventType: "APPOINTMENT_CANCELLED",
          appointmentId: current.id,
          notificationId: notif.id,
          recipientUserIds: [current.customerId],
          actorUserId: params.actorUser.id,
          title: `⚠️ Cita cancelada: ${serviceName} (${dateShort} ${timeFormatted})`,
          body: `${staffName} canceló tu cita de ${serviceName} del ${dateFormatted} a las ${timeFormatted}. Motivo: "${
            cleanReason || "Imprevisto de agenda"
          }". Toca para elegir otro horario.`,
          targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(current.id)}`,
          tag: `apt-cancel-${current.id}`,
        });
      }
    }
  } else {
    // Customer cancelled: mark customer's own unread notifications for this appointment as read
    await tx.notification.updateMany({
      where: {
        userId: params.actorUser.id,
        appointmentId: current.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    // Create persistent internal notification for the assigned professional (if linked to a User account)
    const staffUserId = current.staff?.userId;
    if (staffUserId && staffUserId !== params.actorUser.id) {
      const staffNotifKey = `apt:${current.id}:cancelled_by_customer:v${current.rescheduleVersion}:user:${staffUserId}`;
      await createIdempotentNotificationInTx(tx, {
        userId: staffUserId,
        appointmentId: current.id,
        eventKey: staffNotifKey,
        type: "APPOINTMENT_CANCELLED_BY_CUSTOMER",
        title: `Se liberó el horario de las ${timeFormatted} (${serviceName})`,
        message: `${customerName} canceló su cita de ${serviceName} del ${dateFormatted} a las ${timeFormatted}.`,
      });
    }

    const staffRecipients = await resolveStaffRecipientUserIdsInTx(
      tx,
      staffUserId,
      params.actorUser.id
    );
    if (staffRecipients.length > 0) {
      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${current.id}:cancelled_by_customer:v${current.rescheduleVersion}`,
        eventType: "CUSTOMER_CANCELLED",
        appointmentId: current.id,
        recipientUserIds: staffRecipients,
        actorUserId: params.actorUser.id,
        title: `🔓 Cita cancelada: ${serviceName} (${timeFormatted})`,
        body: `${customerName} canceló su cita de ${serviceName} con ${staffName} del ${dateFormatted} a las ${timeFormatted}. El horario quedó libre.`,
        targetPath: `/admin?tab=agenda&date=${encodeURIComponent(dateYmd)}&appointmentId=${encodeURIComponent(current.id)}`,
        tag: `apt-cust-cancel-${current.id}`,
      });
    }
  }

  const realtimeEvent: RealtimeEventPayload = {
    type: "APPOINTMENT_CANCELLED",
    appointmentId: updated.id,
    staffId: updated.staffId,
    customerId: updated.customerId,
    actorUserId: params.actorUser.id,
    customerName,
    serviceName,
    staffName,
    reason: effectiveStaffReason || cleanReason,
    startAt: current.startAt.toISOString(),
    status: "CANCELLED",
    cancelledBy: cancelledByTag,
    eventKey: `apt:${current.id}:cancelled:v${current.rescheduleVersion}`,
    hasLinkedStaffUser: Boolean(current.staff?.userId),
  };

  return {
    appointment: updated,
    alreadyCancelled: false,
    realtimeEvent,
  };
}
