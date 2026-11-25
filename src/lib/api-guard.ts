// src/lib/api-guard.ts
import { NextResponse } from "next/server";
import { User } from "@prisma/client";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Rejects cross-origin state-mutating requests (defense-in-depth alongside SameSite=Lax cookies).
 * Returns null if allowed, or a 403 NextResponse if Origin/Sec-Fetch-Site indicates cross-site request.
 */
export function verifySameOrigin(req: Request): NextResponse | null {
  const secFetchSite = req.headers.get("sec-fetch-site")?.trim().toLowerCase();
  const origin = req.headers.get("origin");

  if (!origin) {
    if (secFetchSite === "cross-site") {
      return NextResponse.json(
        { error: "Solicitud cross-site bloqueada por seguridad." },
        { status: 403 }
      );
    }
    return null;
  }

  const rawHost =
    req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!rawHost) return null;

  const expectedHost = rawHost.split(",")[0].trim().toLowerCase();
  try {
    const originHost = new URL(origin).host.toLowerCase();
    if (originHost !== expectedHost) {
      return NextResponse.json(
        { error: "Origen de solicitud no autorizado." },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Encabezado Origin inválido." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Safely parses a JSON request body ensuring it is a non-null plain object.
 * Returns HTTP 400 on malformed JSON, null, arrays, or primitive literals instead of throwing 500.
 */
export async function parseJsonObject(
  req: Request
): Promise<
  { data: Record<string, unknown>; error?: never } | { data?: never; error: NextResponse }
> {
  try {
    const raw = (await req.json()) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        error: NextResponse.json(
          { error: "El cuerpo de la solicitud debe ser un objeto JSON válido." },
          { status: 400 }
        ),
      };
    }
    return { data: raw as Record<string, unknown> };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Cuerpo JSON inválido o malformado." },
        { status: 400 }
      ),
    };
  }
}

/**
 * Ensures the request has an authenticated user session (401 when unauthenticated).
 */
export async function requireAuth(): Promise<
  { user: User; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  return { user };
}

/**
 * Ensures the authenticated user has role ADMIN or PROVIDER (401 if unauthenticated, 403 if wrong role).
 */
export async function requireStaffOrAdmin(): Promise<
  { user: User; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN" && user.role !== "PROVIDER") {
    return {
      error: NextResponse.json({ error: "No autorizado" }, { status: 403 }),
    };
  }
  return { user };
}

/**
 * Ensures the authenticated user is the primary ADMIN (401 if unauthenticated, 403 if wrong role).
 */
export async function requireAdmin(
  message = "Solo el Administrador/Dueño principal puede realizar esta acción."
): Promise<{ user: User; error?: never } | { user?: never; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autenticado" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json({ error: message }, { status: 403 }),
    };
  }
  return { user };
}

/**
 * Checks whether a PROVIDER owns the target staffId. ADMIN always passes.
 */
export async function verifyProviderOwnsStaff(
  user: User,
  staffId: string
): Promise<NextResponse | null> {
  if (user.role === "ADMIN") return null;
  const ownStaff = await prisma.staffProfile.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!ownStaff || ownStaff.id !== staffId) {
    return NextResponse.json(
      { error: "Solo tienes permisos para gestionar tu propia agenda o perfil." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Strips credential fields and internal notes before sending User objects to the browser.
 */
export function sanitizeUserForClient<T extends Record<string, unknown>>(
  user: T,
  options: { includeAdminNotes?: boolean } = {}
) {
  const cleaned = { ...user };
  delete cleaned.passwordHash;
  delete cleaned.googleId;
  if (!options.includeAdminNotes) {
    delete cleaned.adminNotes;
  }
  delete cleaned.staffInviteTokenHash;
  delete cleaned.staffInviteExpiresAt;
  delete cleaned.sessionVersion;
  return cleaned;
}

/**
 * Sanitizes an Appointment payload (with nested customer/staff/service) based on viewer role
 * so credential hashes, invite tokens, session versions, and private adminNotes never leak.
 */
export function sanitizeAppointmentForClient<
  T extends {
    customer?: Record<string, unknown> | null;
    staff?: Record<string, unknown> | null;
  } & Record<string, unknown>
>(apt: T, viewerRole: string | null | undefined) {
  const cleaned: Record<string, unknown> = { ...apt };

  if (apt.customer && typeof apt.customer === "object") {
    cleaned.customer = sanitizeUserForClient(apt.customer, {
      includeAdminNotes: viewerRole === "ADMIN",
    });
  }

  if (apt.staff && typeof apt.staff === "object") {
    const staffCopy = { ...apt.staff };
    if (viewerRole !== "ADMIN" && viewerRole !== "PROVIDER") {
      delete staffCopy.userId;
    }
    cleaned.staff = staffCopy;
  }

  return cleaned as T;
}

/**
 * Sanitizes StaffProfile rows for public visitors, peer PROVIDERs (hiding colleague PII and private TimeOff reasons),
 * and ADMINs.
 */
export function sanitizeStaffForViewer<
  T extends {
    userId?: string | null;
    user?: Record<string, unknown> | null;
    timeOffs?: Array<{
      id: string;
      staffId: string;
      startAt: Date | string;
      endAt: Date | string;
      type: string;
      reason?: string | null;
      publicNote?: string | null;
      createdAt?: Date | string;
    }>;
  } & Record<string, unknown>
>(
  staff: T,
  viewer: { role?: string | null; userId?: string | null }
) {
  const isAdmin = viewer.role === "ADMIN";
  const isOwnProvider =
    viewer.role === "PROVIDER" &&
    Boolean(viewer.userId) &&
    staff.userId === viewer.userId;
  const canSeeInternal = isAdmin || isOwnProvider;

  const { userId, user, timeOffs, ...rest } = staff;
  const sanitizedTimeOffs = (timeOffs || []).map((t) => ({
    id: t.id,
    staffId: t.staffId,
    startAt: t.startAt,
    endAt: t.endAt,
    type: t.type,
    reason: canSeeInternal ? t.reason ?? null : t.publicNote ?? null,
    publicNote: t.publicNote ?? null,
    createdAt: t.createdAt,
  }));

  if (canSeeInternal) {
    return {
      ...rest,
      userId,
      ...(user ? { user: sanitizeUserForClient(user) } : {}),
      timeOffs: sanitizedTimeOffs,
    };
  }

  return {
    ...rest,
    timeOffs: sanitizedTimeOffs,
  };
}

/**
 * Redacts PII (emails, phones, push endpoints, keys) from technical error messages before logging.
 */
export function redactSensitiveLogText(raw: string): string {
  return raw
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/https?:\/\/[^\s"']+/gi, "[REDACTED_PUSH_ENDPOINT]")
    .replace(/\+?\d[\d\s()-]{6,}\d/g, "[REDACTED_PHONE]");
}

/**
 * Logs unexpected server errors internally with a diagnostic errorId without leaking database/Prisma traces or PII to clients.
 */
export function safeErrorResponse(
  error: unknown,
  fallbackMessage = "Ocurrió un error interno. Intenta nuevamente.",
  status = 500
): NextResponse {
  const errorId = `err_${randomBytes(4).toString("hex")}`;
  const rawMsg = error instanceof Error ? error.message : String(error ?? "Unknown error");
  console.error(`[API Error ${status} | ${errorId}]:`, redactSensitiveLogText(rawMsg));
  return NextResponse.json({ error: fallbackMessage, errorId }, { status });
}
