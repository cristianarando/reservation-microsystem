// src/lib/services/reminder-service.ts
import { prisma } from "@/lib/prisma";
import { createIdempotentNotificationInTx } from "@/lib/appointment-lifecycle";
import {
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import { enqueuePushDeliveriesInTx } from "@/lib/web-push";

/**
 * Scans upcoming active appointments due for 24h ([23h, 25h]) or 2h ([90m, 150m]) reminders,
 * stamps reminder24hSentAt/reminder2hSentAt atomically to avoid duplicates across restarts,
 * and enqueues in-app Notification + Web Push jobs respecting lock-screen privacy.
 */
export async function enqueueDueAppointmentReminders(
  now: Date = new Date()
): Promise<{ queued24h: number; queued2h: number }> {
  const settings = await prisma.businessSettings.findFirst({
    where: { id: 1 },
    select: { name: true, timezone: true, pushHideDetails: true },
  });
  const businessTz = resolveBusinessTimeZone(settings?.timezone);
  const hidePushDetails = Boolean(settings?.pushHideDetails);

  const w24Start = new Date(now.getTime() + 23 * 3600_000);
  const w24End = new Date(now.getTime() + 25 * 3600_000);
  const w2Start = new Date(now.getTime() + 90 * 60_000);
  const w2End = new Date(now.getTime() + 150 * 60_000);

  const [due24h, due2h] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        reminder24hSentAt: null,
        startAt: { gte: w24Start, lte: w24End },
      },
      include: {
        service: { select: { name: true } },
        staff: { select: { displayName: true } },
      },
      take: 50,
    }),
    prisma.appointment.findMany({
      where: {
        status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        reminder2hSentAt: null,
        startAt: { gte: w2Start, lte: w2End },
      },
      include: {
        service: { select: { name: true } },
        staff: { select: { displayName: true } },
      },
      take: 50,
    }),
  ]);

  let queued24h = 0;
  let queued2h = 0;

  for (const apt of due24h) {
    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: apt.id,
          reminder24hSentAt: null,
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        },
        data: { reminder24hSentAt: now },
      });
      if (updated.count === 0) return false;

      const timeStr = formatSpanishTimeInTz(apt.startAt, businessTz);
      const dateStr = formatSpanishDateInTz(apt.startAt, businessTz);
      const svcName = apt.service?.name || "tu servicio";
      const staffName = apt.staff?.displayName || "tu profesional";

      await createIdempotentNotificationInTx(tx, {
        userId: apt.customerId,
        appointmentId: apt.id,
        eventKey: `apt:${apt.id}:rem24h:user:${apt.customerId}`,
        type: "APPOINTMENT_REMINDER",
        title: `Recordatorio mañana a las ${timeStr}`,
        message: `Tienes cita de ${svcName} con ${staffName} el ${dateStr} a las ${timeStr}.`,
      });

      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${apt.id}:rem24h`,
        eventType: "APPOINTMENT_REMINDER",
        appointmentId: apt.id,
        recipientUserIds: [apt.customerId],
        title: hidePushDetails
          ? "Recordatorio de cita (mañana)"
          : `⏰ Cita mañana a las ${timeStr}`,
        body: hidePushDetails
          ? "Tienes una cita programada para mañana. Toca para consultar los detalles."
          : `Te esperamos mañana ${dateStr} a las ${timeStr} para ${svcName} con ${staffName}.`,
        targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(apt.id)}`,
        tag: `apt-rem-24h-${apt.id}`,
      });
      return true;
    });
    if (claimed) queued24h++;
  }

  for (const apt of due2h) {
    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: apt.id,
          reminder2hSentAt: null,
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        },
        data: { reminder2hSentAt: now },
      });
      if (updated.count === 0) return false;

      const timeStr = formatSpanishTimeInTz(apt.startAt, businessTz);
      const svcName = apt.service?.name || "tu servicio";
      const staffName = apt.staff?.displayName || "tu profesional";

      await createIdempotentNotificationInTx(tx, {
        userId: apt.customerId,
        appointmentId: apt.id,
        eventKey: `apt:${apt.id}:rem2h:user:${apt.customerId}`,
        type: "APPOINTMENT_REMINDER",
        title: `Tu cita comienza pronto (${timeStr})`,
        message: `En unas 2 horas tienes ${svcName} con ${staffName} a las ${timeStr}.`,
      });

      await enqueuePushDeliveriesInTx(tx, {
        eventKey: `apt:${apt.id}:rem2h`,
        eventType: "APPOINTMENT_REMINDER",
        appointmentId: apt.id,
        recipientUserIds: [apt.customerId],
        title: hidePushDetails
          ? "Recordatorio próximo de cita"
          : `🔔 Tu cita es hoy a las ${timeStr}`,
        body: hidePushDetails
          ? "Tu cita está próxima a comenzar. Toca para ver tu pase y ubicación."
          : `En ~2 horas: ${svcName} con ${staffName} a las ${timeStr}.`,
        targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(apt.id)}`,
        tag: `apt-rem-2h-${apt.id}`,
      });
      return true;
    });
    if (claimed) queued2h++;
  }

  return { queued24h, queued2h };
}
