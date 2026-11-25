// src/app/api/appointments/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma, withImmediateLock } from "@/lib/prisma";
import { clearImpersonator, getCurrentUser, setSessionUserId } from "@/lib/session";
import {
  computeAvailableSlotsForStaff,
  formatLocalDateYYYYMMDD,
  parseDateAndTime,
} from "@/lib/slot-engine";
import {
  diffDaysYYYYMMDD,
  formatSpanishDateInTz,
  getDayBoundsInTz,
  getDayOfWeekInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";
import {
  parseJsonObject,
  safeErrorResponse,
  sanitizeAppointmentForClient,
  verifySameOrigin,
} from "@/lib/api-guard";
import { normalizeEmail } from "@/lib/validation/input-validators";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import {
  createIdempotentNotificationInTx,
  resolveStaffRecipientUserIdsInTx,
} from "@/lib/appointment-lifecycle";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
} from "@/lib/web-push";
import {
  consumeRateLimit,
  getClientIp,
  peekRateLimit,
  resetRateLimit,
  tooManyRequestsBody,
} from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const BOOK_AUTH_WINDOW_MS = 15 * 60 * 1000;
const MAX_BOOK_AUTH_FAILS = 5;
const DUMMY_HASH = bcrypt.hashSync("booking-timing-equalizer", 10);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class BookingConflictError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const {
      serviceId,
      staffId,
      date,
      time,
      customerName,
      customerEmail,
      customerPassword,
      customerPhone,
      customerNotes,
    } = parsedBody.data as Record<string, unknown>;

    let user = await getCurrentUser();

    // If not authenticated, require valid credentials or register a new customer atomically
    if (!user) {
      if (
        typeof customerEmail !== "string" ||
        !EMAIL_REGEX.test(customerEmail.trim()) ||
        typeof customerName !== "string" ||
        customerName.trim().length < 2
      ) {
        return NextResponse.json(
          { error: "Por favor proporciona tu nombre y un correo electrónico válido para confirmar la cita." },
          { status: 400 }
        );
      }

      const cleanEmail = normalizeEmail(customerEmail);
      const ip = getClientIp(req);
      const authRateKey = `book-auth-fail:${ip}:${cleanEmail}`;
      const globalEmailKey = `book-auth-fail-email:${cleanEmail}`;

      const rateCheck = peekRateLimit(authRateKey, MAX_BOOK_AUTH_FAILS);
      const globalRateCheck = peekRateLimit(globalEmailKey, MAX_BOOK_AUTH_FAILS * 2);
      if (!rateCheck.allowed || !globalRateCheck.allowed) {
        const retry = Math.max(rateCheck.retryAfterSec, globalRateCheck.retryAfterSec);
        return NextResponse.json(tooManyRequestsBody(retry), {
          status: 429,
          headers: { "Retry-After": String(retry) },
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existingUser) {
        if (typeof customerPassword !== "string" || !customerPassword) {
          await bcrypt.compare("placeholder", DUMMY_HASH);
          return NextResponse.json(
            {
              error: "Ingresa tu contraseña o inicia sesión para confirmar con esta cuenta.",
              requiresPassword: true,
            },
            { status: 401 }
          );
        }

        const isMatch = await bcrypt.compare(
          customerPassword,
          existingUser.passwordHash || DUMMY_HASH
        );
        if (!existingUser.passwordHash || !isMatch) {
          const failState = consumeRateLimit(authRateKey, MAX_BOOK_AUTH_FAILS, BOOK_AUTH_WINDOW_MS);
          consumeRateLimit(globalEmailKey, MAX_BOOK_AUTH_FAILS * 2, BOOK_AUTH_WINDOW_MS);
          if (!failState.allowed) {
            return NextResponse.json(tooManyRequestsBody(failState.retryAfterSec), {
              status: 429,
              headers: { "Retry-After": String(failState.retryAfterSec) },
            });
          }
          return NextResponse.json(
            {
              error:
                "No pudimos verificar tus credenciales. Si registraste esta cuenta con Google, usa el botón de Google.",
            },
            { status: 401 }
          );
        }
        resetRateLimit(authRateKey);
        resetRateLimit(globalEmailKey);
        user = existingUser;
      } else {
        if (
          typeof customerPassword !== "string" ||
          customerPassword.length < 6 ||
          customerPassword.length > 128
        ) {
          return NextResponse.json(
            {
              error: "Crea una contraseña (mínimo 6 caracteres) para proteger tu cuenta y tus citas.",
              requiresPassword: true,
            },
            { status: 400 }
          );
        }

        const cleanPhoneOnReg =
          typeof customerPhone === "string" && customerPhone.trim().length > 0
            ? customerPhone.trim().slice(0, 40)
            : null;
        const passwordHash = await bcrypt.hash(customerPassword, 10);
        try {
          user = await prisma.user.create({
            data: {
              email: cleanEmail,
              name: customerName.trim().slice(0, 120),
              passwordHash,
              phone: cleanPhoneOnReg,
              role: "CUSTOMER",
            },
          });
        } catch (createErr) {
          if (
            createErr instanceof Prisma.PrismaClientKnownRequestError &&
            createErr.code === "P2002"
          ) {
            return NextResponse.json(
              {
                error: "Ya existe una cuenta con este correo. Inicia sesión para continuar.",
                requiresPassword: true,
              },
              { status: 409 }
            );
          }
          throw createErr;
        }
      }

      await clearImpersonator();
      await setSessionUserId(user.id, user.sessionVersion);
    }

    if (user.role === "PROVIDER") {
      return NextResponse.json(
        {
          error:
            "Las cuentas profesionales de doctores no pueden realizar reservas como pacientes. Para consultar o agendar pacientes, utiliza el Panel de Gestión en /admin.",
        },
        { status: 403 }
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        {
          error:
            "Tu cuenta ha sido bloqueada para agendar en línea. Por favor comunícate directamente con nosotros.",
        },
        { status: 403 }
      );
    }

    if (
      typeof serviceId !== "string" ||
      !serviceId ||
      typeof date !== "string" ||
      typeof time !== "string"
    ) {
      return NextResponse.json(
        { error: "Faltan datos obligatorios (servicio, fecha u hora)." },
        { status: 400 }
      );
    }

    const cleanPhoneInput =
      typeof customerPhone === "string" ? customerPhone.trim().slice(0, 40) : "";

    if (cleanPhoneInput.length > 4) {
      await prisma.user.update({
        where: { id: user.id },
        data: { phone: cleanPhoneInput },
      });
      user.phone = cleanPhoneInput;
    } else if (!user.phone) {
      return NextResponse.json(
        { error: "Por favor proporciona un número de teléfono de contacto." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json(
        { error: "Formato de fecha (YYYY-MM-DD) u hora (HH:mm) inválido." },
        { status: 400 }
      );
    }

    const requestedStaffId =
      typeof staffId === "string" && staffId.trim() ? staffId.trim() : "ANY";
    const customerId = user.id;

    // Serialize SQLite write lock from the very start of the transaction (eliminates TOCTOU double-booking)
    const newAppointment = await withImmediateLock(async (tx) => {
      const now = new Date();
      const settings = await tx.businessSettings.findFirst({ where: { id: 1 } });
      const businessTz = resolveBusinessTimeZone(settings?.timezone);
      const hidePushDetails = Boolean(settings?.pushHideDetails);
      const maxActive = settings?.maxActiveBookings ?? 2;
      const slotStep = settings?.slotStepMin ?? 30;

      const txActiveCount = await tx.appointment.count({
        where: {
          customerId,
          endAt: { gt: now },
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
        },
      });
      if (txActiveCount >= maxActive) {
        throw new BookingConflictError(
          `Ya tienes ${txActiveCount} citas futuras activas (el máximo permitido es ${maxActive}). Asiste a tu cita o modifícala antes de reservar una nueva.`,
          429
        );
      }

      const service = await tx.service.findUnique({ where: { id: serviceId } });
      if (!service || !service.isActive) {
        throw new BookingConflictError("Servicio no encontrado o inactivo.", 404);
      }

      const startAt = parseDateAndTime(date, time, businessTz);
      if (isNaN(startAt.getTime())) {
        throw new BookingConflictError("Fecha u hora inválida.", 400);
      }

      const totalDurationMin = service.durationMin + service.bufferAfterMin;
      const endAt = new Date(startAt.getTime() + totalDurationMin * 60_000);

      const todayStr = formatLocalDateYYYYMMDD(now, businessTz);
      const diffDays = diffDaysYYYYMMDD(date, todayStr);
      if (Number.isNaN(diffDays) || diffDays < 0) {
        throw new BookingConflictError("No es posible agendar citas en fechas pasadas.", 400);
      }

      // Prevent customer self-overlap (same customer booking two concurrent appointments)
      const selfOverlap = await tx.appointment.findFirst({
        where: {
          customerId,
          status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
      });
      if (selfOverlap) {
        throw new BookingConflictError(
          "Ya tienes otra cita reservada en ese mismo horario. Elige un horario distinto.",
          409
        );
      }

      const dayOfWeek = getDayOfWeekInTz(date, businessTz);
      const { startOfDay, endOfDay } = getDayBoundsInTz(date, businessTz);
      const nextMorning = new Date(endOfDay.getTime() + 6 * 60 * 60 * 1000);

      const verifyCandidateStaffInTx = async (
        candidateStaffId: string
      ): Promise<{ ok: true } | { ok: false; reason: string }> => {
        const staffProfile = await tx.staffProfile.findUnique({
          where: { id: candidateStaffId },
        });
        if (!staffProfile || !staffProfile.isActive) {
          return { ok: false, reason: "El profesional seleccionado no se encuentra activo." };
        }

        const staffHorizon = staffProfile.customHorizonDays ?? settings?.bookingHorizonDays ?? 7;
        if (diffDays > staffHorizon) {
          return {
            ok: false,
            reason: `La agenda del profesional solo está abierta para los próximos ${staffHorizon} días.`,
          };
        }

        const staffLeadTime =
          staffProfile.customLeadTimeMin ?? settings?.minLeadTimeMinutes ?? 30;
        const [staffShifts, staffTimeOffs, staffAppointments] = await Promise.all([
          tx.workingShift.findMany({
            where: { staffId: candidateStaffId, dayOfWeek },
          }),
          tx.timeOff.findMany({
            where: {
              staffId: candidateStaffId,
              startAt: { lte: nextMorning },
              endAt: { gte: new Date(startOfDay.getTime() - 12 * 3600_000) },
            },
          }),
          tx.appointment.findMany({
            where: {
              staffId: candidateStaffId,
              startAt: { lte: nextMorning },
              endAt: { gte: startOfDay },
              status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
            },
          }),
        ]);

        const validSlots = computeAvailableSlotsForStaff({
          dateStr: date,
          shifts: staffShifts,
          timeOffs: staffTimeOffs,
          appointments: staffAppointments,
          serviceDuration: totalDurationMin,
          slotStepMin: slotStep,
          leadTimeMin: staffLeadTime,
          now,
          timeZone: businessTz,
        });

        if (!validSlots.includes(time)) {
          return {
            ok: false,
            reason: "El horario seleccionado no está disponible o ya pasó el margen de reserva.",
          };
        }

        return { ok: true };
      };

      let targetStaffId: string | null = null;

      if (requestedStaffId === "ANY") {
        const eligible = await tx.staffService.findMany({
          where: { serviceId, staff: { isActive: true } },
          include: { staff: true },
          orderBy: { staff: { sortOrder: "asc" } },
        });
        for (const item of eligible) {
          const check = await verifyCandidateStaffInTx(item.staffId);
          if (check.ok) {
            targetStaffId = item.staffId;
            break;
          }
        }
        if (!targetStaffId) {
          throw new BookingConflictError(
            "No hay profesionales disponibles en este horario exacto.",
            409
          );
        }
      } else {
        const isAssigned = await tx.staffService.findUnique({
          where: {
            staffId_serviceId: {
              staffId: requestedStaffId,
              serviceId,
            },
          },
        });
        if (!isAssigned) {
          throw new BookingConflictError(
            "El profesional seleccionado no ofrece este servicio.",
            400
          );
        }

        const check = await verifyCandidateStaffInTx(requestedStaffId);
        if (!check.ok) {
          throw new BookingConflictError(check.reason, 409);
        }
        targetStaffId = requestedStaffId;
      }

      const created = await tx.appointment.create({
        data: {
          customerId,
          staffId: targetStaffId,
          serviceId,
          startAt,
          endAt,
          status: "CONFIRMED",
          priceSnapshot: service.price,
          customerNotes:
            typeof customerNotes === "string" && customerNotes.trim()
              ? customerNotes.trim().slice(0, 500)
              : null,
        },
        include: {
          service: true,
          staff: true,
          customer: { select: { name: true } },
        },
      });

      const customerLabel = created.customer?.name || "Un cliente";
      const serviceLabel = created.service?.name || "Servicio";
      const staffLabel = created.staff?.displayName || "Profesional";
      const dateFormatted = formatSpanishDateInTz(startAt, businessTz);
      const noteSnippet = created.customerNotes
        ? ` • Nota: "${created.customerNotes.slice(0, 60)}"`
        : "";

      const staffUserId = created.staff?.userId;
      if (staffUserId && staffUserId !== customerId) {
        await createIdempotentNotificationInTx(tx, {
          userId: staffUserId,
          appointmentId: created.id,
          eventKey: `apt:${created.id}:created:v0:user:${staffUserId}`,
          type: "NEW_APPOINTMENT",
          title: `Nueva cita a las ${time} (${serviceLabel})`,
          message: `${customerLabel} reservó ${serviceLabel} para el ${date} a las ${time}.`,
        });
      }

      const staffRecipients = await resolveStaffRecipientUserIdsInTx(
        tx,
        staffUserId,
        customerId
      );
      if (staffRecipients.length > 0) {
        await enqueuePushDeliveriesInTx(tx, {
          eventKey: `apt:${created.id}:created:v0`,
          eventType: "APPOINTMENT_CREATED",
          appointmentId: created.id,
          recipientUserIds: staffRecipients,
          actorUserId: customerId,
          title: hidePushDetails
            ? "Nueva cita registrada"
            : `📅 Nueva cita: ${serviceLabel} (${time})`,
          body: hidePushDetails
            ? "Tienes una nueva reserva en tu agenda. Toca para ver los detalles."
            : `${customerLabel} agendó ${serviceLabel} con ${staffLabel} para el ${dateFormatted} a las ${time}.${noteSnippet}`,
          targetPath: `/admin?tab=agenda&date=${encodeURIComponent(date)}&appointmentId=${encodeURIComponent(created.id)}`,
          tag: `apt-new-${created.id}`,
        });
      }

      return created;
    });

    emitRealtimeEvent({
      type: "APPOINTMENT_CREATED",
      appointmentId: newAppointment.id,
      staffId: newAppointment.staffId,
      customerId: newAppointment.customerId,
      actorUserId: customerId,
      customerName: newAppointment.customer?.name || "Cliente",
      serviceName: newAppointment.service?.name || "Servicio",
      staffName: newAppointment.staff?.displayName || "Profesional",
      reason: newAppointment.customerNotes || undefined,
      startAt: newAppointment.startAt.toISOString(),
      eventKey: `apt:${newAppointment.id}:created:v0`,
      hasLinkedStaffUser: Boolean(newAppointment.staff?.userId),
    });

    void dispatchPendingPushDeliveries().catch((err) => {
      console.error("[WebPush] Appointment created dispatch error:", err);
    });

    return NextResponse.json({
      ok: true,
      appointment: sanitizeAppointmentForClient(newAppointment, user.role),
    });
  } catch (error: unknown) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo confirmar la reserva. Intenta nuevamente.");
  }
}
