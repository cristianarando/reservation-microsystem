// src/app/api/admin/day-override/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { formatLocalDateYYYYMMDD } from "@/lib/date-utils";
import { formatTimeHHmm, parseDateAndTime } from "@/lib/slot-engine";
import {
  validateScheduleOverride,
  validateVacationRange,
} from "@/lib/validation/acceptance-criteria";
import { emitRealtimeEvent, RealtimeEventPayload } from "@/lib/realtime-events";
import { safeErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import {
  cancelAppointmentInTx,
  createIdempotentNotificationInTx,
} from "@/lib/appointment-lifecycle";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
} from "@/lib/web-push";

export const dynamic = "force-dynamic";

const VALID_RESOLUTIONS = new Set(["MOVE_TO_END", "CANCEL_ALL"]);

class DayOverrideError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Finds the earliest contiguous interval of `durationMs` starting at or after `initialCursorMs`
 * that fits inside one of `shiftWindows` (if defined) and does not collide with `occupiedIntervals`.
 */
function findNextAvailableSlotInShifts(params: {
  initialCursorMs: number;
  durationMs: number;
  endOfDayMs: number;
  shiftWindows: Array<{ start: number; end: number }>;
  occupiedIntervals: Array<{ start: number; end: number }>;
}): { start: number; end: number } | null {
  const {
    initialCursorMs,
    durationMs,
    endOfDayMs,
    shiftWindows,
    occupiedIntervals,
  } = params;

  const windows =
    shiftWindows.length > 0
      ? shiftWindows
      : [{ start: initialCursorMs, end: endOfDayMs }];

  for (const win of windows) {
    let cursor = Math.max(initialCursorMs, win.start);

    while (cursor + durationMs <= win.end && cursor + durationMs <= endOfDayMs) {
      const candidateStart = cursor;
      const candidateEnd = cursor + durationMs;

      const colliding = occupiedIntervals.find(
        (occ) => candidateStart < occ.end && candidateEnd > occ.start
      );

      if (!colliding) {
        return { start: candidateStart, end: candidateEnd };
      }

      cursor = Math.max(cursor + 60_000, colliding.end);
    }
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "PROVIDER")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { staffId, type, startAt, endAt, reason, publicNote, resolution } = body;

    if (!staffId || !startAt || !endAt) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (staffId, startAt, endAt)" },
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
      const ownStaff = await prisma.staffProfile.findFirst({
        where: { userId: user.id },
      });
      if (!ownStaff || ownStaff.id !== staffId) {
        return NextResponse.json(
          {
            error:
              "Solo puedes gestionar bloqueos y cierres sobre tu propia agenda.",
          },
          { status: 403 }
        );
      }
    }

    const targetStaffRecords = await prisma.staffProfile.findMany({
      where: staffId === "ALL" ? { isActive: true } : { id: staffId },
      include: { workingShifts: true, timeOffs: true },
    });

    if (targetStaffRecords.length === 0) {
      return NextResponse.json(
        {
          error:
            "No se encontraron profesionales activos para aplicar el bloqueo.",
        },
        { status: 404 }
      );
    }

    const targetStaffIds = targetStaffRecords.map((s) => s.id);
    const now = new Date();

    // Enforce temporal & state invariants
    if (type === "VACATION") {
      if (endDate <= now) {
        return NextResponse.json(
          { error: "No es posible programar vacaciones en fechas pasadas." },
          { status: 400 }
        );
      }
      const vacValidation = validateVacationRange({
        startDate: formatLocalDateYYYYMMDD(startDate),
        endDate: formatLocalDateYYYYMMDD(endDate),
        targets: targetStaffRecords,
        now,
      });
      if (!vacValidation.valid) {
        return NextResponse.json(
          { error: vacValidation.error },
          { status: 400 }
        );
      }
    } else if (
      type === "LATE_START" ||
      type === "EARLY_LEAVE" ||
      type === "FULL_DAY_OFF"
    ) {
      const dateStr = formatLocalDateYYYYMMDD(startDate);
      const timeStr =
        type === "EARLY_LEAVE"
          ? formatTimeHHmm(startDate)
          : type === "LATE_START"
          ? formatTimeHHmm(endDate)
          : undefined;
      const overrideValidation = validateScheduleOverride({
        type,
        dateStr,
        timeStr,
        targets: targetStaffRecords,
        isAllTargets: staffId === "ALL",
        now,
      });

      if (!overrideValidation.valid) {
        return NextResponse.json(
          { error: overrideValidation.error },
          { status: 400 }
        );
      }
    }

    if (
      resolution === "MOVE_TO_END" &&
      (type === "FULL_DAY_OFF" ||
        type === "VACATION" ||
        type === "EARLY_LEAVE" ||
        endDate.getHours() >= 22)
    ) {
      return NextResponse.json(
        {
          error:
            "No es posible mover citas para después del bloqueo cuando se cierra la jornada o son vacaciones. Selecciona cancelar las citas afectadas.",
        },
        { status: 400 }
      );
    }

    const cleanInternalReason =
      typeof reason === "string" && reason.trim()
        ? reason.trim().slice(0, 300)
        : null;
    const cleanPublicNote =
      typeof publicNote === "string" && publicNote.trim()
        ? publicNote.trim().slice(0, 200)
        : null;

    // Execute conflict detection, per-staff slot planning, appointment mutations, notifications, push deliveries, and TimeOff creation atomically
    const txOutcome = await prisma.$transaction(async (tx) => {
      const conflicting = await tx.appointment.findMany({
        where: {
          staffId: { in: targetStaffIds },
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
          startAt: { lt: endDate },
          endAt: { gt: startDate },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              avatarUrl: true,
            },
          },
          service: true,
          staff: true,
        },
        orderBy: { startAt: "asc" },
      });

      if (conflicting.length > 0 && !resolution) {
        return {
          needsResolution: true as const,
          conflicting,
        };
      }

      const emittedEvents: RealtimeEventPayload[] = [];
      const dayStr = formatLocalDateYYYYMMDD(endDate);
      const endOfDay = new Date(`${dayStr}T23:59:59.999`);
      const dayOfWeek = new Date(`${dayStr}T00:00:00`).getDay();

      if (conflicting.length > 0 && resolution === "MOVE_TO_END") {
        // Compute an independent relocation plan per professional
        for (const staffRecord of targetStaffRecords) {
          const staffConflicts = conflicting.filter(
            (c) => c.staffId === staffRecord.id
          );
          if (staffConflicts.length === 0) continue;

          const [remainingApts, otherBlocks] = await Promise.all([
            tx.appointment.findMany({
              where: {
                staffId: staffRecord.id,
                id: { notIn: staffConflicts.map((c) => c.id) },
                status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
                startAt: { lt: endOfDay },
                endAt: { gt: endDate },
              },
              orderBy: { startAt: "asc" },
            }),
            tx.timeOff.findMany({
              where: {
                staffId: staffRecord.id,
                startAt: { lt: endOfDay },
                endAt: { gt: endDate },
              },
              orderBy: { startAt: "asc" },
            }),
          ]);

          const occupiedIntervals: Array<{ start: number; end: number }> = [
            { start: startDate.getTime(), end: endDate.getTime() },
            ...remainingApts.map((a) => ({
              start: new Date(a.startAt).getTime(),
              end: new Date(a.endAt).getTime(),
            })),
            ...otherBlocks.map((b) => ({
              start: new Date(b.startAt).getTime(),
              end: new Date(b.endAt).getTime(),
            })),
          ];

          const shiftWindows = staffRecord.workingShifts
            .filter((s) => s.dayOfWeek === dayOfWeek)
            .map((s) => ({
              start: parseDateAndTime(dayStr, s.startTime).getTime(),
              end: parseDateAndTime(dayStr, s.endTime).getTime(),
            }))
            .filter((w) => w.end > w.start)
            .sort((a, b) => a.start - b.start);

          let staffCursorMs = endDate.getTime();

          for (const apt of staffConflicts) {
            const durationMs =
              (apt.service.durationMin + apt.service.bufferAfterMin) * 60_000;

            const plannedSlot = findNextAvailableSlotInShifts({
              initialCursorMs: staffCursorMs,
              durationMs,
              endOfDayMs: endOfDay.getTime(),
              shiftWindows,
              occupiedIntervals,
            });

            if (!plannedSlot) {
              throw new DayOverrideError(
                `No hay suficientes huecos disponibles dentro del turno de ${staffRecord.displayName} para mover las citas afectadas. Selecciona cancelar las citas o ajusta el bloqueo.`,
                409
              );
            }

            const newStart = new Date(plannedSlot.start);
            const newEnd = new Date(plannedSlot.end);
            occupiedIntervals.push({
              start: plannedSlot.start,
              end: plannedSlot.end,
            });
            staffCursorMs = plannedSlot.end;

            const nextVersion = (apt.rescheduleVersion ?? 0) + 1;

            const updatedCount = await tx.appointment.updateMany({
              where: {
                id: apt.id,
                status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
              },
              data: {
                previousStartAt: apt.startAt,
                startAt: newStart,
                endAt: newEnd,
                status: "RESCHEDULED_BY_STAFF",
                allowFreeCancel: true,
                rescheduleVersion: nextVersion,
                staffMoveReason:
                  cleanInternalReason || "Imprevisto de agenda del profesional",
              },
            });

            if (updatedCount.count === 0) {
              throw new DayOverrideError(
                "Una de las citas afectadas cambió de estado durante la operación. Intenta nuevamente.",
                409
              );
            }

            const moveEventKey = `apt:${apt.id}:moved:v${nextVersion}`;
            const notif = await createIdempotentNotificationInTx(tx, {
              userId: apt.customerId,
              appointmentId: apt.id,
              eventKey: `${moveEventKey}:user:${apt.customerId}`,
              type: "APPOINTMENT_MOVED",
              title: "Tu cita fue reprogramada por el profesional",
              message: `El ${apt.staff.displayName} reprogramó tu cita para el ${newStart.toLocaleDateString()} a las ${newStart.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} (${
                cleanInternalReason || "Imprevisto"
              }). Puedes confirmarla o cancelarla sin penalización.`,
            });

            await enqueuePushDeliveriesInTx(tx, {
              eventKey: moveEventKey,
              eventType: "APPOINTMENT_RESCHEDULED",
              appointmentId: apt.id,
              notificationId: notif.id,
              recipientUserIds: [apt.customerId],
              actorUserId: user.id,
              title: "Cambió el horario de tu cita",
              body: "Ingresa a Mis citas para confirmar el nuevo horario o cancelar sin penalización.",
              targetPath: `/?tab=my-appointments&appointmentId=${encodeURIComponent(apt.id)}`,
              tag: `apt-move-${apt.id}`,
            });

            emittedEvents.push({
              type: "APPOINTMENT_UPDATED",
              appointmentId: apt.id,
              staffId: apt.staffId,
              customerId: apt.customerId,
              actorUserId: user.id,
              status: "RESCHEDULED_BY_STAFF",
              startAt: newStart.toISOString(),
              eventKey: moveEventKey,
            });
          }
        }
      } else if (conflicting.length > 0 && resolution === "CANCEL_ALL") {
        const affectedCustomerAppointments = new Map<string, string[]>();

        for (const apt of conflicting) {
          const cancelRes = await cancelAppointmentInTx(tx, {
            appointmentId: apt.id,
            actorUser: user,
            reason: cleanInternalReason || "Cancelada por imprevisto del profesional",
            isMassClosure: true,
          });
          if (cancelRes.realtimeEvent) {
            emittedEvents.push(cancelRes.realtimeEvent);
          }
          if (!cancelRes.alreadyCancelled) {
            const list = affectedCustomerAppointments.get(apt.customerId) || [];
            list.push(apt.id);
            affectedCustomerAppointments.set(apt.customerId, list);
          }
        }

        // Enqueue one consolidated Web Push notification per affected customer for this mass closure
        for (const [custId, aptIds] of affectedCustomerAppointments.entries()) {
          const sortedIdsKey = [...aptIds].sort().join(",");
          const massEventKey = `mass_cancel:${sortedIdsKey}:user:${custId}`;
          const targetPath =
            aptIds.length === 1
              ? `/?tab=my-appointments&appointmentId=${encodeURIComponent(aptIds[0])}`
              : "/?tab=my-appointments";

          await enqueuePushDeliveriesInTx(tx, {
            eventKey: massEventKey,
            eventType: "MASS_CANCELLATION",
            appointmentId: aptIds[0] || null,
            recipientUserIds: [custId],
            actorUserId: user.id,
            title:
              aptIds.length === 1
                ? "Tu cita fue cancelada"
                : "Hay cambios en tus citas",
            body: "Ingresa a Mis citas para revisar las actualizaciones en tu agenda.",
            targetPath,
            tag: `mass-cancel-${custId}-${startDate.getTime()}`,
          });
        }
      }

      // 3. Save TimeOff record inside the same transaction
      if (type === "FULL_DAY_OFF" || type === "VACATION") {
        await tx.timeOff.deleteMany({
          where: {
            staffId: { in: targetStaffIds },
            type: { not: "VACATION" },
            startAt: { gte: startDate },
            endAt: { lte: endDate },
          },
        });
      } else if (type === "LATE_START" || type === "EARLY_LEAVE") {
        const startDayStr = formatLocalDateYYYYMMDD(startDate);
        const dayStartBound = new Date(`${startDayStr}T00:00:00`);
        const dayEndBound = new Date(`${startDayStr}T23:59:59.999`);
        await tx.timeOff.deleteMany({
          where: {
            staffId: { in: targetStaffIds },
            type,
            startAt: { gte: dayStartBound },
            endAt: { lte: dayEndBound },
          },
        });
      }

      const createdTimeOffs = [];
      for (const tStaffId of targetStaffIds) {
        const created = await tx.timeOff.create({
          data: {
            staffId: tStaffId,
            startAt: startDate,
            endAt: endDate,
            type: type || "CUSTOM_BLOCK",
            reason: cleanInternalReason,
            publicNote: cleanPublicNote,
          },
        });
        createdTimeOffs.push(created);
      }

      return {
        needsResolution: false as const,
        createdTimeOffs,
        conflictsResolved: conflicting.length,
        emittedEvents,
      };
    });

    if (txOutcome.needsResolution) {
      return NextResponse.json({
        hasConflicts: true,
        message: `Existen ${txOutcome.conflicting.length} cita(s) agendada(s) en este horario.`,
        affectedAppointments: txOutcome.conflicting,
      });
    }

    for (const ev of txOutcome.emittedEvents) {
      emitRealtimeEvent(ev);
    }
    emitRealtimeEvent({
      type: "SCHEDULE_UPDATED",
      staffId: staffId === "ALL" ? undefined : staffId,
      actorUserId: user.id,
    });

    void dispatchPendingPushDeliveries().catch((err) => {
      console.error("[WebPush] Day override dispatch error:", err);
    });

    return NextResponse.json({
      ok: true,
      timeOff: txOutcome.createdTimeOffs[0] || null,
      timeOffs: txOutcome.createdTimeOffs,
      conflictsResolved: txOutcome.conflictsResolved,
    });
  } catch (error: unknown) {
    if (error instanceof DayOverrideError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo aplicar el bloqueo de horario.");
  }
}

export async function DELETE(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const user = await getCurrentUser();
    if (!user || (user.role !== "ADMIN" && user.role !== "PROVIDER")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

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
      return NextResponse.json({ error: "Bloqueo no encontrado" }, { status: 404 });
    }

    // Role check: PROVIDER can only delete their own TimeOff blocks
    if (user.role === "PROVIDER") {
      const ownStaff = await prisma.staffProfile.findFirst({
        where: { userId: user.id },
      });
      if (!ownStaff || ownStaff.id !== existing.staffId) {
        return NextResponse.json(
          { error: "Solo puedes eliminar tus propios bloqueos de horario." },
          { status: 403 }
        );
      }
    }

    await prisma.timeOff.delete({ where: { id } });

    emitRealtimeEvent({
      type: "SCHEDULE_UPDATED",
      staffId: existing.staffId,
      actorUserId: user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return safeErrorResponse(error, "No se pudo eliminar el bloqueo de horario.");
  }
}
