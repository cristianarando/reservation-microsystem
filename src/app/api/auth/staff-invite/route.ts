// src/app/api/auth/staff-invite/route.ts
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { clearImpersonator, setSessionUserId } from "@/lib/session";
import {
  safeErrorResponse,
  sanitizeUserForClient,
  verifySameOrigin,
} from "@/lib/api-guard";
import { normalizeEmail } from "@/lib/validation/input-validators";
import {
  consumeRateLimit,
  getClientIp,
  tooManyRequestsBody,
} from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const INVITE_WINDOW_MS = 15 * 60 * 1000;
const MAX_INVITE_ATTEMPTS = 10;

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const ip = getClientIp(req);
    const rate = consumeRateLimit(
      `staff-invite:${ip}`,
      MAX_INVITE_ATTEMPTS,
      INVITE_WINDOW_MS
    );
    if (!rate.allowed) {
      return NextResponse.json(tooManyRequestsBody(rate.retryAfterSec), {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      });
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !token) {
      return NextResponse.json(
        { error: "Faltan el correo o el código de invitación del profesional." },
        { status: 400 }
      );
    }

    if (password.length < 6 || password.length > 128) {
      return NextResponse.json(
        { error: "Define una contraseña segura de entre 6 y 128 caracteres." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { staffProfile: true },
    });

    if (
      !user ||
      !user.staffProfile ||
      !user.staffInviteTokenHash ||
      !user.staffInviteExpiresAt ||
      user.staffInviteExpiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "La invitación de personal es inválida o ha expirado." },
        { status: 401 }
      );
    }

    const providedHash = Buffer.from(
      createHash("sha256").update(token).digest("hex"),
      "utf8"
    );
    const expectedHash = Buffer.from(user.staffInviteTokenHash, "utf8");
    if (
      providedHash.length !== expectedHash.length ||
      !timingSafeEqual(providedHash, expectedHash)
    ) {
      return NextResponse.json(
        { error: "La invitación de personal es inválida o ha expirado." },
        { status: 401 }
      );
    }

    const newPasswordHash = await bcrypt.hash(password, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        role: user.role === "ADMIN" ? "ADMIN" : "PROVIDER",
        passwordHash: newPasswordHash,
        pendingStaffUpgrade: false,
        staffInviteTokenHash: null,
        staffInviteExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });

    await clearImpersonator();
    await setSessionUserId(updatedUser.id, updatedUser.sessionVersion);

    return NextResponse.json({
      ok: true,
      user: sanitizeUserForClient(updatedUser),
    });
  } catch (error: unknown) {
    return safeErrorResponse(error, "No se pudo verificar la invitación de personal.");
  }
}
