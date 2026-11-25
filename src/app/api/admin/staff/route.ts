// src/app/api/admin/staff/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseJsonObject,
  requireAdmin,
  requireStaffOrAdmin,
  safeErrorResponse,
  sanitizeUserForClient,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  StaffServiceError,
  inviteOrReactivateStaff,
  revokeStaffProfile,
  updateStaffProfile,
} from "@/lib/services/staff-service";

export const dynamic = "force-dynamic";

// Only ADMIN (primary owner) can create or revoke staff/provider accounts
export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAdmin(
      "Solo el Administrador/Dueño principal puede gestionar cuentas del personal."
    );
    if (auth.error) return auth.error;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const body = parsedBody.data;

    const result = await inviteOrReactivateStaff({
      actorUserId: auth.user.id,
      displayName: String(body.displayName || ""),
      specialtyTitle: String(body.specialtyTitle || "Especialista"),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      avatarUrl: body.avatarUrl,
      password: body.password,
      serviceIds: body.serviceIds,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof StaffServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.extra || {}) },
        { status: error.status }
      );
    }
    if (error instanceof Error && error.message === "DUPLICATE_STAFF_PROFILE") {
      return NextResponse.json(
        { error: "Este correo ya pertenece a un profesional registrado en el equipo." },
        { status: 409 }
      );
    }
    return safeErrorResponse(error, "No se pudo registrar al profesional.");
  }
}

export async function PATCH(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireStaffOrAdmin();
    if (auth.error) return auth.error;
    const { user } = auth;

    const parsedBody = await parseJsonObject(req);
    if (parsedBody.error) return parsedBody.error;
    const {
      staffId,
      isActive,
      displayName,
      specialtyTitle,
      avatarUrl,
      phone,
      customHorizonDays,
      customLeadTimeMin,
      serviceIds,
      notifyAllStaff,
    } = parsedBody.data;

    // Optional: allow ADMIN to update their own notifyAllStaff preference
    if (notifyAllStaff !== undefined && user.role === "ADMIN" && !staffId) {
      const updatedAdmin = await prisma.user.update({
        where: { id: user.id },
        data: { notifyAllStaff: Boolean(notifyAllStaff) },
      });
      return NextResponse.json({
        ok: true,
        user: sanitizeUserForClient(updatedAdmin),
      });
    }

    if (!staffId || typeof staffId !== "string") {
      return NextResponse.json({ error: "staffId requerido" }, { status: 400 });
    }

    const ownershipErr = await verifyProviderOwnsStaff(user, staffId);
    if (ownershipErr) return ownershipErr;

    const result = await updateStaffProfile({
      actorUser: { id: user.id, role: user.role },
      staffId,
      isActive,
      displayName,
      specialtyTitle,
      avatarUrl,
      phone,
      customHorizonDays,
      customLeadTimeMin,
      serviceIds,
      notifyAllStaff,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof StaffServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.extra || {}) },
        { status: error.status }
      );
    }
    return safeErrorResponse(error, "No se pudo actualizar el perfil del profesional.");
  }
}

export async function DELETE(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAdmin(
      "Solo el Administrador/Dueño puede revocar accesos de personal."
    );
    if (auth.error) return auth.error;
    const { user } = auth;

    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get("staffId");
    const force = searchParams.get("force") === "true";
    if (!staffId) {
      return NextResponse.json({ error: "staffId requerido" }, { status: 400 });
    }

    const result = await revokeStaffProfile({
      actorUserId: user.id,
      staffId,
      force,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof StaffServiceError) {
      return NextResponse.json(
        { error: error.message, ...(error.extra || {}) },
        { status: error.status }
      );
    }
    return safeErrorResponse(error, "No se pudo revocar el acceso del personal.");
  }
}
