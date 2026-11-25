// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionUser, getCurrentUser } from "@/lib/session";
import { safeErrorResponse, verifySameOrigin } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const body = await req.json().catch(() => ({}));
    const endpoint =
      body && typeof body === "object" && typeof body.endpoint === "string"
        ? body.endpoint.trim()
        : "";
    const unbindAll =
      body && typeof body === "object" && body.unbindAllDevices === true;

    const user = await getCurrentUser();
    if (user) {
      if (endpoint) {
        await prisma.pushSubscription.updateMany({
          where: { endpoint, userId: user.id },
          data: { status: "UNSUBSCRIBED" },
        });
      } else if (unbindAll) {
        await prisma.pushSubscription.updateMany({
          where: { userId: user.id, status: "ACTIVE" },
          data: { status: "UNSUBSCRIBED" },
        });
      }
    }

    await clearSessionUser();
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return safeErrorResponse(error, "Error al cerrar sesión");
  }
}
