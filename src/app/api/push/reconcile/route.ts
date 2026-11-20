// src/app/api/push/reconcile/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getImpersonatorId } from "@/lib/session";
import { safeErrorResponse, verifySameOrigin } from "@/lib/api-guard";

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

    const body = await req.json().catch(() => ({}));
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
        unboundPreviousOwner: true,
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
