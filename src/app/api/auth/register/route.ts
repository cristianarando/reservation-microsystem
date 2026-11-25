// src/app/api/auth/register/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearImpersonator, setSessionUserId } from "@/lib/session";
import {
  parseJsonObject,
  safeErrorResponse,
  sanitizeUserForClient,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  consumeRateLimit,
  getClientIp,
  tooManyRequestsBody,
} from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const REGISTER_WINDOW_MS = 15 * 60 * 1000;
const MAX_REGISTRATIONS_PER_IP = 15;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const ip = getClientIp(req);
    const rate = consumeRateLimit(`register:ip:${ip}`, MAX_REGISTRATIONS_PER_IP, REGISTER_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(tooManyRequestsBody(rate.retryAfterSec), {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      });
    }

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const { name, email, password, phone } = parsedBody.data;

    if (!name || typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json(
        { error: "Por favor ingresa tu nombre completo (entre 2 y 100 caracteres)." },
        { status: 400 }
      );
    }

    if (
      !email ||
      typeof email !== "string" ||
      email.length > 254 ||
      !EMAIL_REGEX.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "Por favor ingresa un correo electrónico válido." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: "La contraseña debe tener entre 6 y 128 caracteres." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone =
      typeof phone === "string" && phone.trim().length > 0
        ? phone.trim().slice(0, 40)
        : null;

    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Ya existe una cuenta con este correo electrónico. Por favor inicia sesión con tu contraseña.",
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        phone: cleanPhone,
        role: "CUSTOMER",
      },
    });

    await clearImpersonator();
    await setSessionUserId(user.id, user.sessionVersion);

    return NextResponse.json({
      ok: true,
      user: sanitizeUserForClient(user),
    });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Ya existe una cuenta con este correo electrónico. Por favor inicia sesión con tu contraseña.",
        },
        { status: 409 }
      );
    }
    return safeErrorResponse(error, "No se pudo completar el registro. Intenta nuevamente.");
  }
}
