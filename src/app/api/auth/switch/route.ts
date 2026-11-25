// src/app/api/auth/switch/route.ts
// "Preview as staff" impersonation. Only an ADMIN can start it, and the only way
// back is to the ADMIN recorded in the purpose-scoped impersonator cookie.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clearImpersonator,
  getCurrentUser,
  getImpersonatorIdentity,
  setImpersonatorId,
  setSessionUserId,
} from "@/lib/session";
import {
  parseJsonObject,
  safeErrorResponse,
  sanitizeUserForClient,
  verifySameOrigin,
} from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;

    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!userId) {
      return NextResponse.json({ error: "Falta el usuario destino (userId)." }, { status: 400 });
    }

    const impersonator = await getImpersonatorIdentity();

    // Case 1: an impersonating session returns to the original ADMIN (verifying sessionVersion!).
    if (impersonator && userId === impersonator.userId) {
      const admin = await prisma.user.findUnique({ where: { id: impersonator.userId } });
      if (
        !admin ||
        admin.role !== "ADMIN" ||
        admin.isBlocked ||
        (admin.sessionVersion ?? 1) !== impersonator.sessionVersion
      ) {
        await clearImpersonator();
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }
      await clearImpersonator();
      await setSessionUserId(admin.id, admin.sessionVersion);
      return NextResponse.json({ ok: true, user: sanitizeUserForClient(admin) });
    }

    // Case 2: start a preview. Only the real ADMIN may do this (PROVIDER/CUSTOMER cannot escalate).
    const actingAdmin = currentUser.role === "ADMIN" ? currentUser : null;
    if (!actingAdmin) {
      return NextResponse.json(
        { error: "No autorizado para cambiar de sesión de personal." },
        { status: 403 }
      );
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    // Previews are restricted to active staff accounts; never into customers or other admins.
    if (targetUser.role !== "PROVIDER" && targetUser.id !== actingAdmin.id) {
      return NextResponse.json(
        { error: "Solo se puede previsualizar la sesión de un profesional del equipo." },
        { status: 403 }
      );
    }

    if (targetUser.id === actingAdmin.id) {
      await clearImpersonator();
    } else {
      await setImpersonatorId(actingAdmin.id, actingAdmin.sessionVersion ?? 1);
    }
    await setSessionUserId(targetUser.id, targetUser.sessionVersion);
    return NextResponse.json({
      ok: true,
      user: sanitizeUserForClient(targetUser),
      impersonatorId: targetUser.id === actingAdmin.id ? null : actingAdmin.id,
    });
  } catch (error: unknown) {
    return safeErrorResponse(error, "Error al cambiar de sesión");
  }
}
