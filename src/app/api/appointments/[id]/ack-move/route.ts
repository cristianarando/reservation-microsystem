// src/app/api/appointments/[id]/ack-move/route.ts
import { NextResponse } from "next/server";
import type { Appointment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { parseJsonObject, safeErrorResponse, sanitizeAppointmentForClient, verifySameOrigin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

class AckMoveConflictError extends Error {
  status: number;
  currentStatus: string;
  appointment: Appointment | null;
  constructor(
    message: string,
    currentStatus: string,
    appointment: Appointment | null,
    status = 409
  ) {
    super(message);
    this.status = status;
    this.currentStatus = currentStatus;
    this.appointment = appointment;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const { id } = await params;
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;
    const expectedStartAt =
      typeof body?.expectedStartAt === "string" ? body.expectedStartAt : undefined;
    const expectedVersion =
      typeof body?.expectedVersion === "number" ? body.expectedVersion : undefined;
    const notificationId =
      typeof body?.notificationId === "string" ? body.notificationId : undefined;

    const result = await prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({ where: { id } });
      if (!appointment) {
        return { notFound: true as const };
      }

      if (appointment.customerId !== user.id) {
        return { forbidden: true as const };
      }

      const startAtMatches =
        !expectedStartAt ||
        new Date(expectedStartAt).getTime() === appointment.startAt.getTime();
      const versionMatches =
        expectedVersion === undefined ||
        expectedVersion === appointment.rescheduleVersion;

      // Idempotent repeat confirmation on an already CONFIRMED appointment at the same version/time
      if (appointment.status === "CONFIRMED") {
        if (!startAtMatches || !versionMatches) {
          throw new AckMoveConflictError(
            "El horario de esta cita fue modificado nuevamente. Revisa el estado actual.",
            appointment.status,
            appointment
          );
        }

        await tx.notification.updateMany({
          where: {
            userId: user.id,
            appointmentId: id,
            type: "APPOINTMENT_MOVED",
            ...(notificationId ? { id: notificationId } : {}),
          },
          data: { isRead: true },
        });

        return {
          ok: true as const,
          idempotent: true,
          appointment,
        };
      }

      // Never allow an outdated tab or push link to reactivate a CANCELLED, COMPLETED, or NO_SHOW appointment
      if (appointment.status !== "RESCHEDULED_BY_STAFF") {
        throw new AckMoveConflictError(
          appointment.status === "CANCELLED"
            ? "Esta cita fue cancelada y ya no puede confirmarse."
            : "Esta cita ya no se encuentra pendiente de confirmación de cambio de horario.",
          appointment.status,
          appointment
        );
      }

      // Guard against confirming an outdated reschedule if the appointment was moved a second time
      if (!startAtMatches || !versionMatches) {
        throw new AckMoveConflictError(
          "Esta cita fue reprogramada a un nuevo horario recientemente. Revisa la hora actualizada antes de confirmar.",
          appointment.status,
          appointment
        );
      }

      const updatedCount = await tx.appointment.updateMany({
        where: {
          id,
          customerId: user.id,
          status: "RESCHEDULED_BY_STAFF",
          rescheduleVersion: appointment.rescheduleVersion,
          startAt: appointment.startAt,
        },
        data: {
          status: "CONFIRMED",
        },
      });

      if (updatedCount.count === 0) {
        const latest = await tx.appointment.findUnique({ where: { id } });
        throw new AckMoveConflictError(
          "El estado de la cita cambió mientras se procesaba tu confirmación.",
          latest?.status || "UNKNOWN",
          latest
        );
      }

      const updated = await tx.appointment.findUniqueOrThrow({ where: { id } });

      // Mark only the APPOINTMENT_MOVED notification(s) as read; preserve any APPOINTMENT_CANCELLED notices
      await tx.notification.updateMany({
        where: {
          userId: user.id,
          appointmentId: id,
          type: "APPOINTMENT_MOVED",
          ...(notificationId ? { id: notificationId } : {}),
        },
        data: { isRead: true },
      });

      return {
        ok: true as const,
        idempotent: false,
        appointment: updated,
      };
    });

    if ("notFound" in result && result.notFound) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }
    if ("forbidden" in result && result.forbidden) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      appointment: sanitizeAppointmentForClient(result.appointment, user.role),
    });
  } catch (error: unknown) {
    if (error instanceof AckMoveConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          currentStatus: error.currentStatus,
          appointment: error.appointment,
        },
        { status: error.status }
      );
    }
    return safeErrorResponse(error, "No se pudo confirmar el cambio de horario.");
  }
}
