// src/app/api/admin/shifts/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  validateAllShifts,
  sanitizeAndSortShifts,
  ShiftItem,
} from "@/lib/validation/acceptance-criteria";
import { safeErrorResponse, verifySameOrigin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "PROVIDER")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      staffId,
      shifts,
      customHorizonDays,
      customLeadTimeMin,
      isActive,
    } = body;

    if (!staffId) {
      return NextResponse.json(
        { error: "Falta el parámetro obligatorio staffId" },
        { status: 400 }
      );
    }

    // Role check: PROVIDER can only edit their own schedule
    if (user.role === "PROVIDER") {
      const ownStaff = await prisma.staffProfile.findFirst({
        where: { userId: user.id },
      });
      if (!ownStaff || ownStaff.id !== staffId) {
        return NextResponse.json(
          { error: "Solo tienes permisos para modificar tus propios horarios." },
          { status: 403 }
        );
      }
    }

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

    return NextResponse.json({
      ok: true,
      staff: updated,
      effectiveIsActive: updated?.isActive,
    });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudieron guardar los horarios de atención."
    );
  }
}
