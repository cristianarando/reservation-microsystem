// src/app/api/admin/staff/route.ts
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  requireStaffOrAdmin,
  safeErrorResponse,
  sanitizeUserForClient,
  verifyProviderOwnsStaff,
  verifySameOrigin,
} from "@/lib/api-guard";
import {
  clampInt,
  normalizeEmail,
  sanitizeImageOrDataUrl,
} from "@/lib/validation/input-validators";
import { getRandomStaffAvatar } from "@/lib/avatars";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Only ADMIN (primary owner) can create or revoke staff/provider accounts
export async function POST(req: Request) {
  try {
    const originErr = verifySameOrigin(req);
    if (originErr) return originErr;

    const auth = await requireAdmin(
      "Solo el Administrador/Dueño principal puede gestionar cuentas del personal."
    );
    if (auth.error) return auth.error;

    const body = await req.json().catch(() => ({}));
    const displayName = String(body.displayName || "").trim().slice(0, 120);
    const specialtyTitle = String(body.specialtyTitle || "Especialista").trim().slice(0, 120);
    const email = normalizeEmail(body.email);
    const phone = String(body.phone || "").trim().slice(0, 40);

    const avatarCheck = sanitizeImageOrDataUrl(body.avatarUrl);
    if (!avatarCheck.ok) {
      return NextResponse.json({ error: avatarCheck.error }, { status: 400 });
    }
    const avatarUrl = avatarCheck.value;

    if (displayName.length < 3) {
      return NextResponse.json(
        { error: "El nombre del profesional debe tener al menos 3 caracteres." },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Ingresa un correo de Google válido para vincular la cuenta del profesional." },
        { status: 400 }
      );
    }

    // Generate cryptographically random initial password and invitation token
    const rawPassword =
      typeof body.password === "string" && body.password.trim().length >= 6
        ? body.password.trim()
        : randomBytes(12).toString("base64url");
    const initialStaffPassword = await bcrypt.hash(rawPassword, 10);

    const inviteToken = randomBytes(24).toString("base64url");
    const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const inviteExpiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);

    const allServices = await prisma.service.findMany({ where: { isActive: true } });
    const validIdSet = new Set(allServices.map((s) => s.id));
    if (Array.isArray(body.serviceIds)) {
      const invalidIds = body.serviceIds.map(String).filter((id: string) => !validIdSet.has(id));
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: "Uno o más servicios seleccionados no existen o están inactivos." },
          { status: 400 }
        );
      }
    }
    const targetServiceIds: string[] = Array.isArray(body.serviceIds)
      ? Array.from(new Set(body.serviceIds.map(String)))
      : allServices.map((s) => s.id);

    const result = await prisma.$transaction(async (tx) => {
      let staffUser = await tx.user.findUnique({ where: { email } });
      let requiresVerification = false;

      if (!staffUser) {
        staffUser = await tx.user.create({
          data: {
            email,
            name: displayName,
            passwordHash: initialStaffPassword,
            phone: phone || "+591 70000000",
            role: "PROVIDER",
            avatarUrl,
            sessionVersion: 1,
            pendingStaffUpgrade: false,
            staffInviteTokenHash: inviteTokenHash,
            staffInviteExpiresAt: inviteExpiresAt,
          },
        });
      } else {
        const existingProfile = await tx.staffProfile.findUnique({
          where: { userId: staffUser.id },
        });
        if (existingProfile) {
          throw new Error("DUPLICATE_STAFF_PROFILE");
        }

        if (staffUser.role === "ADMIN") {
          staffUser = await tx.user.update({
            where: { id: staffUser.id },
            data: {
              name: displayName,
              phone: phone || staffUser.phone,
            },
          });
        } else {
          // Existing CUSTOMER account: never inherit unverified local password or keep existing sessions active.
          // Rotate credentials, revoke prior sessions via sessionVersion++, and require holder verification
          // before elevating role from CUSTOMER to PROVIDER.
          requiresVerification = true;
          staffUser = await tx.user.update({
            where: { id: staffUser.id },
            data: {
              role: "CUSTOMER",
              pendingStaffUpgrade: true,
              name: displayName,
              passwordHash: initialStaffPassword,
              phone: phone || staffUser.phone,
              sessionVersion: { increment: 1 },
              staffInviteTokenHash: inviteTokenHash,
              staffInviteExpiresAt: inviteExpiresAt,
            },
          });

          // Deactivate any prior push subscriptions bound during unverified customer sessions
          await tx.pushSubscription.updateMany({
            where: { userId: staffUser.id, status: "ACTIVE" },
            data: { status: "REVOKED" },
          });
        }
      }

      const newStaff = await tx.staffProfile.create({
        data: {
          userId: staffUser.id,
          displayName,
          specialtyTitle,
          avatarUrl: avatarUrl || getRandomStaffAvatar(),
          isActive: true,
          services: {
            create: targetServiceIds.map((serviceId) => ({
              serviceId,
            })),
          },
          workingShifts: {
            create: [1, 2, 3, 4, 5, 6].map((day) => ({
              dayOfWeek: day,
              startTime: "09:00",
              endTime: day === 6 ? "13:00" : "18:00",
            })),
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              avatarUrl: true,
              pendingStaffUpgrade: true,
            },
          },
          services: true,
          workingShifts: true,
        },
      });

      return { newStaff, staffUser, requiresVerification };
    });

    return NextResponse.json({
      ok: true,
      staff: result.newStaff,
      user: sanitizeUserForClient(result.staffUser),
      inviteToken,
      invitePath: `/admin?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`,
      temporaryPassword: rawPassword,
      requiresVerification: result.requiresVerification,
    });
  } catch (error: unknown) {
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

    const body = await req.json().catch(() => ({}));
    const {
      staffId,
      isActive,
      displayName,
      specialtyTitle,
      avatarUrl,
      customHorizonDays,
      customLeadTimeMin,
      serviceIds,
      notifyAllStaff,
    } = body;

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

    let validatedAvatar: string | null | undefined = undefined;
    if (avatarUrl !== undefined) {
      const avatarCheck = sanitizeImageOrDataUrl(avatarUrl);
      if (!avatarCheck.ok) {
        return NextResponse.json({ error: avatarCheck.error }, { status: 400 });
      }
      validatedAvatar = avatarCheck.value;
    }

    let validServiceIds: string[] | undefined = undefined;
    if (Array.isArray(serviceIds)) {
      const requestedIds = Array.from(new Set(serviceIds.map(String)));
      const validServices = await prisma.service.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true },
      });
      if (validServices.length !== requestedIds.length) {
        return NextResponse.json(
          { error: "Uno o más servicios asignados no son válidos." },
          { status: 400 }
        );
      }
      validServiceIds = validServices.map((s) => s.id);
    }

    // Both ADMIN and the owning PROVIDER can pause/resume their own agenda (isActive).
    // Revoking staff access altogether remains strictly in DELETE (Admin-only).
    const updated = await prisma.$transaction(async (tx) => {
      if (validServiceIds !== undefined) {
        await tx.staffService.deleteMany({
          where: { staffId },
        });
        if (validServiceIds.length > 0) {
          await tx.staffService.createMany({
            data: validServiceIds.map((svcId: string) => ({
              staffId,
              serviceId: svcId,
            })),
          });
        }
      }

      if (notifyAllStaff !== undefined && user.role === "ADMIN") {
        await tx.user.update({
          where: { id: user.id },
          data: { notifyAllStaff: Boolean(notifyAllStaff) },
        });
      }

      return tx.staffProfile.update({
        where: { id: staffId },
        data: {
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
          ...(typeof displayName === "string" && displayName.trim().length >= 2
            ? { displayName: displayName.trim().slice(0, 120) }
            : {}),
          ...(typeof specialtyTitle === "string" && specialtyTitle.trim().length >= 2
            ? { specialtyTitle: specialtyTitle.trim().slice(0, 120) }
            : {}),
          ...(validatedAvatar !== undefined ? { avatarUrl: validatedAvatar } : {}),
          ...(customHorizonDays !== undefined
            ? {
                customHorizonDays:
                  customHorizonDays === null
                    ? null
                    : clampInt(customHorizonDays, 1, 90, 7),
              }
            : {}),
          ...(customLeadTimeMin !== undefined
            ? {
                customLeadTimeMin:
                  customLeadTimeMin === null
                    ? null
                    : clampInt(customLeadTimeMin, 0, 1440, 30),
              }
            : {}),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
              avatarUrl: true,
            },
          },
          services: true,
          workingShifts: true,
        },
      });
    });

    return NextResponse.json({
      ok: true,
      staff: updated,
      effectiveIsActive: updated.isActive,
    });
  } catch (error: unknown) {
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
    if (!staffId) {
      return NextResponse.json({ error: "staffId requerido" }, { status: 400 });
    }

    const profile = await prisma.staffProfile.findUnique({ where: { id: staffId } });
    if (!profile) {
      return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staffId },
        data: { isActive: false },
      });

      if (profile.userId && profile.userId !== user.id) {
        await tx.user.update({
          where: { id: profile.userId },
          data: {
            role: "CUSTOMER",
            pendingStaffUpgrade: false,
            staffInviteTokenHash: null,
            staffInviteExpiresAt: null,
            sessionVersion: { increment: 1 },
          },
        });

        await tx.pushSubscription.updateMany({
          where: { userId: profile.userId, status: "ACTIVE" },
          data: { status: "REVOKED" },
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return safeErrorResponse(error, "No se pudo revocar el acceso del personal.");
  }
}
