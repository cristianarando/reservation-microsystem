// src/app/api/admin/push/dispatch/route.ts
import { NextResponse } from "next/server";
import {
  requireAdmin,
  safeErrorResponse,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  dispatchPendingPushDeliveries,
  expireStalePendingDeliveries,
  getPushDispatcherMetrics,
  setPushDispatcherPaused,
} from "@/lib/web-push";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const metrics = await getPushDispatcherMetrics();
    return NextResponse.json({ ok: true, metrics });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudieron consultar las métricas de notificaciones."
    );
  }
}

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "dispatch";

    if (action === "pause") {
      setPushDispatcherPaused(true);
    } else if (action === "resume") {
      if (body.expireStale) {
        await expireStalePendingDeliveries();
      }
      setPushDispatcherPaused(false);
    } else if (action === "expire_stale") {
      const expired = await expireStalePendingDeliveries();
      const metrics = await getPushDispatcherMetrics();
      return NextResponse.json({ ok: true, expired, metrics });
    }

    const dispatchResult =
      action === "dispatch" || action === "resume"
        ? await dispatchPendingPushDeliveries()
        : null;
    const metrics = await getPushDispatcherMetrics();

    return NextResponse.json({
      ok: true,
      dispatchResult,
      metrics,
    });
  } catch (error: unknown) {
    return safeErrorResponse(
      error,
      "No se pudo ejecutar la operación del despachador push."
    );
  }
}
