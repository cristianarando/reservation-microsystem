// src/lib/services/staff-service.ts
import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getRandomStaffAvatar } from "@/lib/avatars";
import { sanitizeStaffForViewer, sanitizeUserForClient } from "@/lib/api-guard";
import {
  clampInt,
  normalizeEmail,
  sanitizeImageOrDataUrl,
} from "@/lib/validation/input-validators";
import { emitRealtimeEvent } from "@/lib/realtime-events";
import { invalidateSeoCache } from "@/lib/seo";

const STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class StaffServiceError extends Error {
  status: number;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export async function inviteOrReactivateStaff(params: {
  actorUserId: string;
  displayName: string;
  specialtyTitle: string;
  email: string;
  phone: string;
  avatarUrl?: unknown;
  password?: unknown;
  serviceIds?: unknown;
}) {
  const displayName = params.displayName.trim().slice(0, 120);
  const specialtyTitle =
    (params.specialtyTitle || "Especialista").trim().slice(0, 120) || "Especialista";
  const email = normalizeEmail(params.email);
  const phone = (params.phone || "").trim().slice(0, 40);

  const avatarCheck = sanitizeImageOrDataUrl(params.avatarUrl);
  if (!avatarCheck.ok) {
    throw new StaffServiceError(avatarCheck.error, 400);
  }
  const avatarUrl = avatarCheck.value;

  if (displayName.length < 3) {
    throw new StaffServiceError(
      "El nombre del profesional debe tener al menos 3 caracteres.",
      400
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new StaffServiceError(
      "Ingresa un correo de Google válido para vincular la cuenta del profesional.",
      400
    );
  }

  const rawPassword =
    typeof params.password === "string" && params.password.trim().length >= 6
      ? params.password.trim()
      : randomBytes(12).toString("base64url");
  const initialStaffPassword = await bcrypt.hash(rawPassword, 10);

  const inviteToken = randomBytes(24).toString("base64url");
  const inviteTokenHash = createHash("sha256").update(inviteToken).digest("hex");
  const inviteExpiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);

  const allServices = await prisma.service.findMany({ where: { isActive: true } });
  const validIdSet = new Set(allServices.map((s) => s.id));
  if (Array.isArray(params.serviceIds)) {
    const invalidIds = params.serviceIds
      .map(String)
      .filter((id: string) => !validIdSet.has(id));
    if (invalidIds.length > 0) {
      throw new StaffServiceError(
        "Uno o más servicios seleccionados no existen o están inactivos.",
        400
      );
    }
  }
  const targetServiceIds: string[] = Array.isArray(params.serviceIds)
    ? Array.from(new Set(params.serviceIds.map(String)))
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

      const newStaff = await tx.staffProfile.create({
        data: {
          userId: staffUser.id,
          displayName,
          specialtyTitle,
          avatarUrl: avatarUrl || getRandomStaffAvatar(),
          isActive: true,
          services: {
            create: targetServiceIds.map((serviceId) => ({ serviceId })),
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
    }

    const existingProfile = await tx.staffProfile.findUnique({
      where: { userId: staffUser.id },
    });

    if (
      existingProfile &&
      (existingProfile.isActive ||
        staffUser.pendingStaffUpgrade ||
        staffUser.role !== "CUSTOMER")
    ) {
      throw new StaffServiceError(
        "Este correo ya pertenece a un profesional registrado en el equipo.",
        409
      );
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
      requiresVerification = true;
      staffUser = await tx.user.update({
        where: { id: staffUser.id },
        data: {
          pendingStaffUpgrade: true,
          staffInviteTokenHash: inviteTokenHash,
          staffInviteExpiresAt: inviteExpiresAt,
        },
      });
    }

    const newStaff = existingProfile
      ? await tx.staffProfile.update({
          where: { id: existingProfile.id },
          data: {
            displayName,
            specialtyTitle,
            avatarUrl:
              avatarUrl || existingProfile.avatarUrl || getRandomStaffAvatar(),
            isActive: !requiresVerification,
            services: {
              deleteMany: {},
              create: targetServiceIds.map((serviceId) => ({ serviceId })),
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
        })
      : await tx.staffProfile.create({
          data: {
            userId: staffUser.id,
            displayName,
            specialtyTitle,
            avatarUrl: avatarUrl || getRandomStaffAvatar(),
            isActive: !requiresVerification,
            services: {
              create: targetServiceIds.map((serviceId) => ({ serviceId })),
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

  invalidateSeoCache();
  revalidatePath("/", "layout");

  emitRealtimeEvent({
    type: "SCHEDULE_UPDATED",
    staffId: result.newStaff.id,
    actorUserId: params.actorUserId,
  });

  return {
    ok: true,
    staff: result.newStaff,
    user: sanitizeUserForClient(result.staffUser),
    ...(result.staffUser.role !== "ADMIN"
      ? {
          inviteToken,
          invitePath: `/admin?invite=${encodeURIComponent(inviteToken)}&email=${encodeURIComponent(email)}`,
          temporaryPassword: result.requiresVerification ? undefined : rawPassword,
        }
      : {}),
    requiresVerification: result.requiresVerification,
  };
}

export async function updateStaffProfile(params: {
  actorUser: { id: string; role: string };
  staffId: string;
  isActive?: unknown;
  displayName?: unknown;
  specialtyTitle?: unknown;
  avatarUrl?: unknown;
  phone?: unknown;
  customHorizonDays?: unknown;
  customLeadTimeMin?: unknown;
  serviceIds?: unknown;
  notifyAllStaff?: unknown;
}) {
  const {
    actorUser,
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
  } = params;

  if (Array.isArray(serviceIds) && actorUser.role !== "ADMIN") {
    throw new StaffServiceError(
      "Solo el Administrador/Dueño puede modificar los servicios asignados.",
      403
    );
  }

  let validatedAvatar: string | null | undefined = undefined;
  if (avatarUrl !== undefined) {
    const avatarCheck = sanitizeImageOrDataUrl(avatarUrl);
    if (!avatarCheck.ok) {
      throw new StaffServiceError(avatarCheck.error, 400);
    }
    validatedAvatar = avatarCheck.value;
  }

  let validServiceIds: string[] | undefined = undefined;
  if (Array.isArray(serviceIds)) {
    const requestedIds = Array.from(new Set(serviceIds.map(String)));
    const validServices = await prisma.service.findMany({
      where: { id: { in: requestedIds }, isActive: true },
      select: { id: true },
    });
    if (validServices.length !== requestedIds.length) {
      throw new StaffServiceError(
        "Uno o más servicios asignados no existen o están inactivos.",
        400
      );
    }
    validServiceIds = validServices.map((s) => s.id);
  }

  const cleanPhone =
    typeof phone === "string" && phone.trim().length > 0
      ? phone.trim().slice(0, 40)
      : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.staffProfile.findUnique({
      where: { id: staffId },
      include: { user: true },
    });
    if (!existing) {
      throw new StaffServiceError("Profesional no encontrado", 404);
    }

    if (validServiceIds !== undefined) {
      await tx.staffService.deleteMany({ where: { staffId } });
      if (validServiceIds.length > 0) {
        await tx.staffService.createMany({
          data: validServiceIds.map((svcId) => ({ staffId, serviceId: svcId })),
        });
      }
    }

    if (notifyAllStaff !== undefined && actorUser.role === "ADMIN") {
      await tx.user.update({
        where: { id: actorUser.id },
        data: { notifyAllStaff: Boolean(notifyAllStaff) },
      });
    }

    if (existing.userId && existing.user) {
      const shouldRestoreRole =
        actorUser.role === "ADMIN" &&
        isActive === true &&
        existing.user.role === "CUSTOMER" &&
        !existing.user.pendingStaffUpgrade;

      if (shouldRestoreRole || cleanPhone !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(shouldRestoreRole
              ? { role: "PROVIDER", sessionVersion: { increment: 1 } }
              : {}),
            ...(cleanPhone !== undefined ? { phone: cleanPhone } : {}),
          },
        });
      }
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

  invalidateSeoCache();
  revalidatePath("/", "layout");

  emitRealtimeEvent({
    type: "SCHEDULE_UPDATED",
    staffId: updated.id,
    actorUserId: actorUser.id,
  });

  return {
    ok: true,
    staff: sanitizeStaffForViewer(updated, {
      role: actorUser.role,
      userId: actorUser.id,
    }),
    effectiveIsActive: updated.isActive,
  };
}

export async function revokeStaffProfile(params: {
  actorUserId: string;
  staffId: string;
  force: boolean;
}) {
  const { actorUserId, staffId, force } = params;

  const profile = await prisma.staffProfile.findUnique({ where: { id: staffId } });
  if (!profile) {
    throw new StaffServiceError("Profesional no encontrado", 404);
  }

  const upcomingCount = await prisma.appointment.count({
    where: {
      staffId,
      endAt: { gt: new Date() },
      status: { in: ["CONFIRMED", "RESCHEDULED_BY_STAFF"] },
    },
  });
  if (upcomingCount > 0 && !force) {
    throw new StaffServiceError(
      `Este profesional tiene ${upcomingCount} cita(s) próxima(s) activa(s). Reprograma o cancela sus citas antes de revocar el acceso.`,
      409,
      { upcomingCount }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.staffProfile.update({
      where: { id: staffId },
      data: { isActive: false },
    });

    if (profile.userId && profile.userId !== actorUserId) {
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

  invalidateSeoCache();
  revalidatePath("/", "layout");

  emitRealtimeEvent({
    type: "SCHEDULE_UPDATED",
    staffId,
    actorUserId,
  });

  return { ok: true };
}
