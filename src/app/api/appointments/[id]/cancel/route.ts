// src/app/api/appointments/[id]/cancel/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { canCustomerCancelAppointment } from "@/lib/booking-rules";
import {
  safeErrorResponse,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import { cancelAppointmentInTx } from "@/lib/appointment-lifecycle";
import { dispatchPendingPushDeliveries } from "@/lib/web-push";

export const dynamic = "force-dynamic";

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

    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : undefined;

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { staff: true, service: true },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const isStaffOrAdmin = user.role === "ADMIN" || user.role === "PROVIDER";
    const isOwner = appointment.customerId === user.id;

    if (!isOwner && !isStaffOrAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    if (!isOwner && user.role === "PROVIDER") {
      const ownershipErr = await verifyProviderOwnsStaff(user, appointment.staffId);
      if (ownershipErr) return ownershipErr;
    }

    const settings = await prisma.businessSettings.findFirst({ where: { id: 1 } });
    const minNotice = settings?.minCancelNoticeHours ?? 6;

    // Check rules if customer is cancelling
    if (!isStaffOrAdmin) {
      const check = canCustomerCancelAppointment(appointment, minNotice);
      if (!check.allowed) {
        return NextResponse.json(
          {
            error: check.reason,
            whatsappUrl: `https://wa.me/${settings?.phoneWhatsapp?.replace(/\D/g, "")}`,
          },
          { status: 403 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      return cancelAppointmentInTx(tx, {
        appointmentId: id,
        actorUser: user,
        reason,
      });
    });

    if (result.realtimeEvent) {
      emitRealtimeEvent(result.realtimeEvent);
      void dispatchPendingPushDeliveries().catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      idempotent: result.alreadyCancelled,
      appointment: result.appointment,
    });
  } catch (error: unknown) {
    return safeErrorResponse(error, "No se pudo cancelar la cita.");
  }
}
