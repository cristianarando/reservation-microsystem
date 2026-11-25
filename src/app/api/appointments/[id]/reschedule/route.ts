// src/app/api/appointments/[id]/reschedule/route.ts
import { NextResponse } from "next/server";
import {
  parseJsonObject,
  requireAuth,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  BookingConflictError,
  rescheduleAppointment,
} from "@/lib/services/booking-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const { id } = await params;
    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;

    if (typeof body.newDate !== "string" || typeof body.newTime !== "string") {
      return NextResponse.json(
        { error: "Debes indicar la nueva fecha y hora." },
        { status: 400 }
      );
    }

    const appointment = await rescheduleAppointment({
      appointmentId: id,
      actorUser: { id: user.id, role: user.role, name: user.name },
      newDate: body.newDate.trim(),
      newTime: body.newTime.trim(),
      newStaffId:
        typeof body.newStaffId === "string" ? body.newStaffId.trim() : undefined,
      reason: typeof body.reason === "string" ? body.reason : null,
      allowOverbooking: Boolean(body.allowOverbooking),
    });

    return NextResponse.json({ ok: true, appointment });
  } catch (error: unknown) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo reprogramar la cita.");
  }
}
