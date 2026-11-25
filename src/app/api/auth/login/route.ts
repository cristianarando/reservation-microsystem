// src/app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionUserId, clearImpersonator } from "@/lib/session";
import {
  parseJsonObject,
  safeErrorResponse,
  sanitizeUserForClient,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  consumeRateLimit,
  peekRateLimit,
  resetRateLimit,
  getClientIp,
  tooManyRequestsBody,
} from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

// Generic message for every credential failure (prevents user enumeration).
const INVALID_CREDENTIALS = "Correo o contraseña incorrectos. Por favor verifica tus datos.";

// Valid bcrypt hash (same cost factor) used to keep response time constant when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-not-a-real-password", 10);

// Brute-force limits on FAILED attempts
const MAX_FAILS_PER_ACCOUNT_IP = 5; // per IP+email
const MAX_FAILS_PER_EMAIL_GLOBAL = 10; // per email across all IPs
const MAX_FAILS_PER_IP = 20; // across all emails from one IP
const FAIL_WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const { email, password, role } = parsedBody.data;

    if (!email || typeof email !== "string" || email.length > 254) {
      return NextResponse.json(
        { error: "Debes ingresar tu correo electrónico." },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string" || password.length > 128) {
      return NextResponse.json(
        { error: "Debes ingresar tu contraseña." },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const ip = getClientIp(req);
    const accountKey = `login-fail:${ip}:${cleanEmail}`;
    const emailGlobalKey = `login-fail-email:${cleanEmail}`;
    const ipKey = `login-fail-ip:${ip}`;

    const accountGate = peekRateLimit(accountKey, MAX_FAILS_PER_ACCOUNT_IP);
    const emailGate = peekRateLimit(emailGlobalKey, MAX_FAILS_PER_EMAIL_GLOBAL);
    const ipGate = peekRateLimit(ipKey, MAX_FAILS_PER_IP);
    if (!accountGate.allowed || !emailGate.allowed || !ipGate.allowed) {
      const retry = Math.max(
        accountGate.retryAfterSec,
        emailGate.retryAfterSec,
        ipGate.retryAfterSec
      );
      return NextResponse.json(tooManyRequestsBody(retry), {
        status: 429,
        headers: { "Retry-After": String(retry) },
      });
    }

    const registerFailure = () => {
      consumeRateLimit(accountKey, MAX_FAILS_PER_ACCOUNT_IP, FAIL_WINDOW_MS);
      consumeRateLimit(emailGlobalKey, MAX_FAILS_PER_EMAIL_GLOBAL, FAIL_WINDOW_MS);
      consumeRateLimit(ipKey, MAX_FAILS_PER_IP, FAIL_WINDOW_MS);
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    };

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    // Always run bcrypt so existing and non-existing accounts take the same time.
    const isMatch = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);

    if (!user || !user.passwordHash || !isMatch) {
      return registerFailure();
    }

    // Role gate is evaluated only AFTER valid credentials, so it reveals nothing to attackers.
    // Note: pendingStaffUpgrade accounts MUST verify via /api/auth/staff-invite (inviteToken) or Google OAuth.
    if (role === "STAFF" || role === "ADMIN" || role === "PROVIDER") {
      if (user.role !== "ADMIN" && user.role !== "PROVIDER") {
        return NextResponse.json(
          {
            error: user.pendingStaffUpgrade
              ? "Tu invitación como profesional está pendiente. Ábrela desde el enlace de invitación para activarla."
              : "Esta cuenta no tiene permisos de profesional o administrador.",
          },
          { status: 403 }
        );
      }
    }

    resetRateLimit(accountKey);
    resetRateLimit(emailGlobalKey);
    await clearImpersonator();
    await setSessionUserId(user.id, user.sessionVersion);

    return NextResponse.json({
      ok: true,
      user: sanitizeUserForClient(user),
    });
  } catch (error: unknown) {
    return safeErrorResponse(error, "Error al iniciar sesión");
  }
}
