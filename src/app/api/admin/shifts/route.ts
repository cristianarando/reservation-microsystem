// src/app/api/admin/shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  validateAllShifts,
  sanitizeAndSortShifts,
  ShiftItem,
} from "@/lib/validation/acceptance-criteria";
import {
  parseJsonObject,
  requireStaffOrAdmin,
  safeErrorResponse,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import { emitRealtimeEvent } from "@/lib/realtime-events";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const {
      staffId,
      shifts,
      customHorizonDays,
      customLeadTimeMin,
      isActive,
    } = parsedBody.data as {
      staffId?: string;
      shifts?: unknown;
      customHorizonDays?: unknown;
      customLeadTimeMin?: unknown;
      isActive?: unknown;
    };

    if (!staffId || typeof staffId !== "string") {
      return NextResponse.json(
        { error: "Falta el parámetro obligatorio staffId" },
        { status: 400 }
      );
    }

    const ownershipErr = await verifyProviderOwnsStaff(user, staffId);
    if (ownershipErr) return ownershipErr;

    // Validate boundaries for horizon and lead time
    if (customHorizonDays !== undefined) {
      const horizon = Number(customHorizonDays);
      if (isNaN(horizon) || horizon < 1 || horizon > 90) {
        return NextResponse.json(
          { error: "La ventana de reserva debe estar entre 1 y 90 días." },
          { status: 400 }
        );
      }
    }

    if (customLeadTimeMin !== undefined) {
      const leadTime = Number(customLeadTimeMin);
      if (isNaN(leadTime) || leadTime < 0 || leadTime > 1440) {
        return NextResponse.json(
          {
            error:
              "El margen mínimo de aviso debe estar entre 0 y 1440 minutos (24 horas).",
          },
          { status: 400 }
        );
      }
    }

    // Strict validation of shifts array against Acceptance Criteria
    let validatedShifts: ShiftItem[] = [];
    if (Array.isArray(shifts)) {
      const rawShifts: ShiftItem[] = shifts.map(
        (s: {
          id?: string;
          dayOfWeek?: unknown;
          startTime?: unknown;
          endTime?: unknown;
        }) => ({
          id: s.id,
          dayOfWeek: Number(s.dayOfWeek),
          startTime: String(s.startTime || "").trim(),
          endTime: String(s.endTime || "").trim(),
        })
      );

      const validationResult = validateAllShifts(rawShifts, {
        maxShiftsPerDay: 3,
        minDurationMin: 30,
      });

      if (!validationResult.isValid) {
        return NextResponse.json(
          {
            error:
              "Los horarios enviados contienen errores o violan los criterios de aceptación.",
            details: validationResult.errors.map((e) => e.message),
          },
          { status: 400 }
        );
      }

      validatedShifts = sanitizeAndSortShifts(rawShifts);
    }

    // Update staff profile preferences and working shifts atomically in a single transaction
    const updated = await prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staffId },
        data: {
          customHorizonDays:
            customHorizonDays !== undefined
              ? Number(customHorizonDays)
              : undefined,
          customLeadTimeMin:
            customLeadTimeMin !== undefined
              ? Number(customLeadTimeMin)
              : undefined,
          isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        },
      });

      if (Array.isArray(shifts)) {
        await tx.workingShift.deleteMany({ where: { staffId } });
        if (validatedShifts.length > 0) {
          await tx.workingShift.createMany({
            data: validatedShifts.map((s) => ({
              staffId,
              dayOfWeek: s.dayOfWeek,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          });
        }
      }

      return tx.staffProfile.findUnique({
        where: { id: staffId },
        include: { workingShifts: true },
      });
    });

    emitRealtimeEvent({
      type: "SCHEDULE_UPDATED",
      staffId,
      actorUserId: user.id,
    });

    return NextResponse.json({
      ok: true,
      staff: updated,
      effectiveIsActive: updated?.isActive,
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2025"
    ) {
      return NextResponse.json({ error: "Profesional no encontrado." }, { status: 404 });
    }
    return safeErrorResponse(
      error,
      "No se pudieron guardar los horarios de atención."
    );
  }
}
