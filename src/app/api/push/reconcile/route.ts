// src/app/api/push/reconcile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getImpersonatorId } from "@/lib/session";
import { parseJsonObject, safeErrorResponse, verifySameOrigin } from "@/lib/api-guard";
import { consumeRateLimit, getClientIp, tooManyRequestsBody } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Reconciles a browser's existing push subscription against the active session on shared devices.
 * - During admin impersonation ("preview as staff"), leaves device bindings untouched.
 * - If logged out or logged in as a DIFFERENT user than the subscription's owner, unbinds the previous owner's subscription.
 */
export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const ip = getClientIp(req);
    const rate = consumeRateLimit(`push-reconcile:${ip}`, 30, 5 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(tooManyRequestsBody(rate.retryAfterSec), {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      });
    }

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;
    const endpoint =
      typeof body.endpoint === "string" ? body.endpoint.trim() : "";

    const [user, impersonatorId] = await Promise.all([
      getCurrentUser(),
      getImpersonatorId(),
    ]);

    if (impersonatorId && user && impersonatorId !== user.id) {
      return NextResponse.json({
        ok: true,
        impersonating: true,
        boundToCurrentUser: false,
      });
    }

    if (!endpoint) {
      return NextResponse.json({
        ok: true,
        boundToCurrentUser: false,
      });
    }

    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (!existing) {
      return NextResponse.json({
        ok: true,
        boundToCurrentUser: false,
      });
    }

    if (!user || existing.userId !== user.id) {
      if (existing.status === "ACTIVE") {
        await prisma.pushSubscription.update({
          where: { id: existing.id },
          data: { status: "UNSUBSCRIBED" },
        });
      }
      return NextResponse.json({
        ok: true,
        boundToCurrentUser: false,
      });
    }

    if (existing.status === "ACTIVE") {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { lastConfirmedAt: new Date() },
      });
      return NextResponse.json({
        ok: true,
        boundToCurrentUser: true,
      });
    }

    return NextResponse.json({
      ok: true,
      boundToCurrentUser: false,
    });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudo reconciliar el estado de notificaciones."
    );
  }
}
