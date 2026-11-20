// src/app/api/push/test/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getImpersonatorId } from "@/lib/session";
import {
  requireAuth,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import { consumeRateLimit, tooManyRequestsBody } from "@/lib/rate-limit";
import {
  dispatchPendingPushDeliveries,
  enqueuePushDeliveriesInTx,
  isPushDispatcherPaused,
} from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const impersonatorId = await getImpersonatorId();
    if (impersonatorId && impersonatorId !== user.id) {
      return NextResponse.json(
        {
          error:
            "Vuelve a tu sesión original antes de enviar una notificación de prueba.",
        },
        { status: 403 }
      );
    }

    const rate = consumeRateLimit(`push-test:${user.id}`, 10, 5 * 60_000);
    if (!rate.allowed) {
      return NextResponse.json(tooManyRequestsBody(rate.retryAfterSec), {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSec) },
      });
    }

    if (isPushDispatcherPaused()) {
      return NextResponse.json(
        {
          error:
            "El envío de notificaciones Web Push está pausado en el servidor (PUSH_DISPATCH_PAUSED).",
        },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const currentEndpoint =
      typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

    const activeSubs = await prisma.pushSubscription.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, endpoint: true },
    });

    if (activeSubs.length === 0) {
      return NextResponse.json(
        {
          error:
            "No hay dispositivos activos registrados para tu usuario. Pulsa 'Activar avisos' primero.",
        },
        { status: 400 }
      );
    }

    if (
      currentEndpoint &&
      !activeSubs.some((sub) => sub.endpoint === currentEndpoint)
    ) {
      return NextResponse.json(
        {
          error:
            "Este navegador tiene una suscripción distinta o desvinculada. Desactiva y vuelve a activar los avisos en este dispositivo.",
        },
        { status: 409 }
      );
    }

    const eventKey = `test:${user.id}:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const targetPath =
      user.role === "CUSTOMER" ? "/?tab=my-appointments" : "/admin?tab=agenda";

    await prisma.$transaction((tx) =>
      enqueuePushDeliveriesInTx(tx, {
        eventKey,
        eventType: "TEST_PUSH",
        recipientUserIds: [user.id],
        actorUserId: null,
        title: "🔔 Prueba Web Push desde el servidor",
        body: "Conexión real con el servicio push verificada correctamente.",
        targetPath,
        tag: `reservas-test-push-${Date.now()}`,
        ttlSeconds: 300,
      })
    );

    const stats = await dispatchPendingPushDeliveries({
      recipientUserId: user.id,
      limit: 20,
    });

    const deliveries = await prisma.pushDelivery.findMany({
      where: { eventKey, recipientUserId: user.id },
      select: {
        status: true,
        lastStatusCode: true,
        lastError: true,
      },
    });

    if (stats.delivered === 0) {
      const firstErr = deliveries.find((d) => d.lastError)?.lastError;
      return NextResponse.json(
        {
          ok: false,
          stats,
          deliveries,
          error: firstErr
            ? `El servicio push rechazó o no pudo entregar el aviso (${firstErr}). Prueba desactivar y volver a activar los avisos.`
            : "No se pudo entregar la notificación push en este intento.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      stats,
      deliveries,
    });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudo enviar la notificación push de prueba."
    );
  }
}
