// src/app/api/admin/appointments/route.ts
import { NextResponse } from "next/server";
import {
  parseJsonObject,
  requireStaffOrAdmin,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  BookingConflictError,
  createStaffWalkInAppointment,
} from "@/lib/services/booking-service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;

    if (
      typeof body.staffId !== "string" ||
      !body.staffId.trim() ||
      typeof body.serviceId !== "string" ||
      !body.serviceId.trim() ||
      typeof body.date !== "string" ||
      typeof body.time !== "string"
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (profesional, servicio, fecha u hora)." },
        { status: 400 }
      );
    }

    const appointment = await createStaffWalkInAppointment({
      actorUser: { id: user.id, role: user.role, name: user.name },
      staffId: body.staffId.trim(),
      serviceId: body.serviceId.trim(),
      date: body.date.trim(),
      time: body.time.trim(),
      customerName: typeof body.customerName === "string" ? body.customerName : "",
      customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : "",
      customerEmail: typeof body.customerEmail === "string" ? body.customerEmail : null,
      customerNotes: typeof body.customerNotes === "string" ? body.customerNotes : null,
      allowOverbooking: Boolean(body.allowOverbooking),
    });

    return NextResponse.json({ ok: true, appointment });
  } catch (error: unknown) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo registrar la cita presencial.");
  }
}
