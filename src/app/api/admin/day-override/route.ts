// src/app/api/admin/day-override/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import {
  parseJsonObject,
  requireStaffOrAdmin,
  safeErrorResponse,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  ScheduleServiceError,
  VALID_RESOLUTIONS,
  VALID_TIMEOFF_TYPES,
  applyDayOverride,
} from "@/lib/services/schedule-service";

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

    if (
      !staffId ||
      !startAt ||
      !endAt ||
      !type ||
      typeof type !== "string" ||
      !VALID_TIMEOFF_TYPES.has(type)
    ) {
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

    const outcome = await applyDayOverride({
      actorUser: { id: user.id, role: user.role, name: user.name },
      staffId,
      type,
      startDate,
      endDate,
      reason: typeof reason === "string" ? reason : null,
      publicNote: typeof publicNote === "string" ? publicNote : null,
      resolution: typeof resolution === "string" ? resolution : undefined,
    });

    if (outcome.hasConflicts) {
      return NextResponse.json({
        hasConflicts: true,
        message: outcome.message,
        affectedAppointments: outcome.affectedAppointments,
      });
    }

    return NextResponse.json({
      ok: true,
      timeOff: outcome.timeOff,
      timeOffs: outcome.timeOffs,
      conflictsResolved: outcome.conflictsResolved,
    });
  } catch (error: unknown) {
    if (error instanceof ScheduleServiceError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
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
      return NextResponse.json(
        { error: "Bloqueo no encontrado" },
        { status: 404 }
      );
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
    return safeErrorResponse(
      error,
      "No se pudo eliminar el bloqueo de horario."
    );
  }
}
