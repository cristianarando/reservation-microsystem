// src/app/api/appointments/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearImpersonator, getCurrentUser, setSessionUserId } from "@/lib/session";
import {
  parseJsonObject,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import { normalizeEmail } from "@/lib/validation/input-validators";
import {
  BookingConflictError,
  createCustomerAppointment,
} from "@/lib/services/booking-service";
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

    const appointment = await createCustomerAppointment({
      customerId,
      viewerRole: user.role,
      serviceId,
      staffId: requestedStaffId,
      date,
      time,
      customerNotes:
        typeof customerNotes === "string" ? customerNotes : null,
    });

    return NextResponse.json({
      ok: true,
      appointment,
    });
  } catch (error: unknown) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return safeErrorResponse(error, "No se pudo confirmar la reserva. Intenta nuevamente.");
  }
}
