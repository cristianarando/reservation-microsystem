// src/app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearSessionUser, getCurrentUser } from "@/lib/session";
import { safeErrorResponse } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const endpoint =
      typeof body?.endpoint === "string" ? body.endpoint.trim() : "";

    if (endpoint) {
      await prisma.pushSubscription.updateMany({
        where: { endpoint },
        data: { status: "UNSUBSCRIBED" },
      });
    } else {
      const user = await getCurrentUser();
      if (user && body?.unbindAllDevices === true) {
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
