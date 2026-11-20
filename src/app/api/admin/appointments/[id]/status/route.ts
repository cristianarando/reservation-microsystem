// src/app/api/admin/appointments/[id]/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireStaffOrAdmin,
  safeErrorResponse,
  sanitizeUserForClient,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import { VALID_APPOINTMENT_STATUSES } from "@/lib/validation/input-validators";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import {
  cancelAppointmentInTx,
  validateAppointmentStatusTransition,
} from "@/lib/appointment-lifecycle";
import { dispatchPendingPushDeliveries } from "@/lib/web-push";

export const dynamic = "force-dynamic";

class StatusTransitionError extends Error {
  status: number;
  currentStatus?: string;
  constructor(message: string, status = 409, currentStatus?: string) {
    super(message);
    this.status = status;
    this.currentStatus = currentStatus;
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, reason, blockCustomer } = body;

    if (
      typeof status !== "string" ||
      !(VALID_APPOINTMENT_STATUSES as readonly string[]).includes(status)
    ) {
      return NextResponse.json(
        { error: "Estado de cita inválido." },
        { status: 400 }
      );
    }

    const initialCheck = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, staffId: true },
    });

    if (!initialCheck) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const ownershipErr = await verifyProviderOwnsStaff(user, initialCheck.staffId);
    if (ownershipErr) return ownershipErr;

    const cleanReason =
      typeof reason === "string" ? reason.trim().slice(0, 300) : undefined;
    const effectiveReason =
      status === "CANCELLED"
        ? cleanReason || "Cancelada por el profesional / imprevisto de agenda"
        : cleanReason;

    const result = await prisma.$transaction(async (tx) => {
      const currentApt = await tx.appointment.findUnique({
        where: { id },
        include: { customer: true, service: true, staff: true },
      });

      if (!currentApt) {
        throw new StatusTransitionError("Cita no encontrada", 404);
      }

      const previousStatus = currentApt.status;
      const transition = validateAppointmentStatusTransition(
        previousStatus,
        status
      );

      if (!transition.allowed) {
        throw new StatusTransitionError(
          transition.error || "Transición de estado no permitida.",
          409,
          previousStatus
        );
      }

      // Idempotent repeat: if status is already `status`, do not increment counters or duplicate notifications
      if (transition.idempotent) {
        return {
          updated: currentApt,
          finalCustomer: currentApt.customer,
          idempotent: true,
          realtimeEvent: null,
        };
      }

      // If reactivating a CANCELLED appointment into a slot-occupying status, verify the slot is still free
      if (transition.requiresSlotRevalidation) {
        const overlappingApt = await tx.appointment.findFirst({
          where: {
            id: { not: currentApt.id },
            staffId: currentApt.staffId,
            status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            startAt: { lt: currentApt.endAt },
            endAt: { gt: currentApt.startAt },
          },
        });
        if (overlappingApt) {
          throw new StatusTransitionError(
            "No se puede reactivar esta cita porque su horario ya fue ocupado por otra reserva.",
            409,
            previousStatus
          );
        }

        const overlappingTimeOff = await tx.timeOff.findFirst({
          where: {
            staffId: currentApt.staffId,
            startAt: { lt: currentApt.endAt },
            endAt: { gt: currentApt.startAt },
          },
        });
        if (overlappingTimeOff) {
          throw new StatusTransitionError(
            "No se puede reactivar esta cita porque existe un bloqueo de horario en esa franja.",
            409,
            previousStatus
          );
        }
      }

      let updated = currentApt;
      let cancelEvent = null;

      if (status === "CANCELLED") {
        const cancelRes = await cancelAppointmentInTx(tx, {
          appointmentId: id,
          actorUser: user,
          reason: cleanReason,
        });
        updated = cancelRes.appointment;
        cancelEvent = cancelRes.realtimeEvent;
      } else {
        const guardedUpdate = await tx.appointment.updateMany({
          where: {
            id,
            status: previousStatus,
          },
          data: {
            status,
            ...(effectiveReason ? { staffMoveReason: effectiveReason } : {}),
          },
        });

        if (guardedUpdate.count === 0) {
          throw new StatusTransitionError(
            "El estado de la cita fue modificado concurrentemente. Refresca la agenda e intenta de nuevo.",
            409
          );
        }

        updated = await tx.appointment.findUniqueOrThrow({
          where: { id },
          include: { customer: true, service: true, staff: true },
        });
      }

      // Compute counter deltas based on the guarded transition from previousStatus -> status
      let completedDelta = 0;
      if (previousStatus !== "COMPLETED" && status === "COMPLETED") {
        completedDelta = 1;
      } else if (previousStatus === "COMPLETED" && status !== "COMPLETED") {
        completedDelta = -1;
      }

      let noShowDelta = 0;
      if (previousStatus !== "NO_SHOW" && status === "NO_SHOW") {
        noShowDelta = 1;
      } else if (previousStatus === "NO_SHOW" && status !== "NO_SHOW") {
        noShowDelta = -1;
      }

      const freshCustomer = await tx.user.findUniqueOrThrow({
        where: { id: currentApt.customerId },
      });

      const nextCompleted = Math.max(
        0,
        freshCustomer.completedCount + completedDelta
      );
      const nextNoShow = Math.max(0, freshCustomer.noShowCount + noShowDelta);

      const canModifyBlock = user.role === "ADMIN" || status === "NO_SHOW";
      let nextBlocked = freshCustomer.isBlocked;
      if (status === "NO_SHOW") {
        if (blockCustomer || nextNoShow >= 2) {
          nextBlocked = true;
        }
      } else if (canModifyBlock && blockCustomer !== undefined) {
        nextBlocked = Boolean(blockCustomer);
      }

      let finalCustomer = freshCustomer;
      if (
        completedDelta !== 0 ||
        noShowDelta !== 0 ||
        nextBlocked !== freshCustomer.isBlocked
      ) {
        finalCustomer = await tx.user.update({
          where: { id: currentApt.customerId },
          data: {
            completedCount: nextCompleted,
            noShowCount: nextNoShow,
            isBlocked: nextBlocked,
          },
        });
      }

      return {
        updated,
        finalCustomer,
        idempotent: false,
        realtimeEvent:
          cancelEvent || {
            type: "APPOINTMENT_UPDATED" as const,
            appointmentId: updated.id,
            staffId: updated.staffId,
            customerId: updated.customerId,
            actorUserId: user.id,
            status,
          },
      };
    });

    if (result.realtimeEvent) {
      emitRealtimeEvent(result.realtimeEvent);
      void dispatchPendingPushDeliveries().catch((err) => {
        console.error("[WebPush] Status dispatch error:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      idempotent: result.idempotent,
      appointment: result.updated,
      customer: sanitizeUserForClient(result.finalCustomer),
    });
  } catch (error: unknown) {
    if (error instanceof StatusTransitionError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.currentStatus ? { currentStatus: error.currentStatus } : {}),
        },
        { status: error.status }
      );
    }
    return safeErrorResponse(error, "No se pudo actualizar el estado de la cita.");
  }
}
