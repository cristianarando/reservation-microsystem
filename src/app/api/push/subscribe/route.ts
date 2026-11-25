// src/app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpersonatorId } from "@/lib/session";
import {
  parseJsonObject,
  requireAuth,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import { consumeRateLimit, tooManyRequestsBody } from "@/lib/rate-limit";
import { validatePushSubscriptionInput } from "@/lib/web-push";

export const dynamic = "force-dynamic";

const MAX_ACTIVE_SUBSCRIPTIONS_PER_USER = 10;

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const rate = consumeRateLimit(`push-sub:${user.id}`, 20, 5 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(tooManyRequestsBody(rate.retryAfterSec), {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      });
    }

    // Never bind the admin's browser device to a staff account during "Preview as staff" impersonation
    const impersonatorId = await getImpersonatorId();
    if (impersonatorId && impersonatorId !== user.id) {
      return NextResponse.json(
        {
          error:
            "No se pueden activar ni vincular notificaciones de este dispositivo mientras estás en modo vista previa de otro profesional.",
        },
        { status: 403 }
      );
    }

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;
    const rawSub = body.subscription ?? body;
    const validated = validatePushSubscriptionInput(rawSub);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const userAgent =
      typeof req.headers.get("user-agent") === "string"
        ? req.headers.get("user-agent")!.slice(0, 255)
        : null;

    const now = new Date();
    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.pushSubscription.upsert({
        where: { endpoint: validated.endpoint },
        update: {
          userId: user.id,
          p256dh: validated.p256dh,
          auth: validated.auth,
          userAgent,
          status: "ACTIVE",
          lastConfirmedAt: now,
          lastErrorCode: null,
        },
        create: {
          userId: user.id,
          endpoint: validated.endpoint,
          p256dh: validated.p256dh,
          auth: validated.auth,
          userAgent,
          status: "ACTIVE",
          lastConfirmedAt: now,
        },
        select: {
          id: true,
          userId: true,
          status: true,
          lastConfirmedAt: true,
        },
      });

      // Cap active push subscriptions per user to prevent amplification/DoS
      const activeList = await tx.pushSubscription.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        orderBy: { lastConfirmedAt: "desc" },
        select: { id: true },
      });
      if (activeList.length > MAX_ACTIVE_SUBSCRIPTIONS_PER_USER) {
        const overflowIds = activeList
          .slice(MAX_ACTIVE_SUBSCRIPTIONS_PER_USER)
          .map((s) => s.id);
        await tx.pushSubscription.updateMany({
          where: { id: { in: overflowIds } },
          data: { status: "UNSUBSCRIBED" },
        });
      }

      return sub;
    });

    return NextResponse.json({
      ok: true,
      subscription,
    });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudo registrar la suscripción de notificaciones."
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => null);
    const endpoint =
      body && typeof body === "object" && typeof (body as Record<string, unknown>).endpoint === "string"
        ? ((body as Record<string, unknown>).endpoint as string).trim()
        : searchParams.get("endpoint")?.trim() || "";

    if (!endpoint) {
      return NextResponse.json(
        { error: "Se requiere el endpoint de la suscripción para desactivar avisos." },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.updateMany({
      where: { endpoint, userId: user.id },
      data: { status: "UNSUBSCRIBED" },
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudo desactivar la suscripción de notificaciones."
    );
  }
}
