// src/app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpersonatorId } from "@/lib/session";
import {
  requireAuth,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import { validatePushSubscriptionInput } from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

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

    const body = await req.json().catch(() => ({}));
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
    const subscription = await prisma.pushSubscription.upsert({
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

    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const endpoint =
      typeof body.endpoint === "string"
        ? body.endpoint.trim()
        : searchParams.get("endpoint")?.trim() || "";

    if (!endpoint) {
      return NextResponse.json(
        { error: "Se requiere el endpoint de la suscripción para desactivar avisos." },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.updateMany({
      where: { endpoint },
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
