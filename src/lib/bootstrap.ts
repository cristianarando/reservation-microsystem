import { prisma } from "@/lib/prisma";
import { sanitizeStaffForViewer, sanitizeUserForClient } from "@/lib/api-guard";
import { getCurrentUser, getImpersonatorId } from "@/lib/session";
import { getCustomerBootstrapAppointments } from "@/lib/appointment-queries";
import { DEFAULT_BUSINESS_LOGO } from "@/lib/avatars";
import type {
  PortalAppointment,
  PortalBusinessSettings,
  PortalNotification,
  PortalService,
  PortalStaffMember,
  PortalUser,
} from "@/types/portal";

export interface BootstrapHistoryPage {
  items: PortalAppointment[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

export interface BootstrapPayload {
  settings: PortalBusinessSettings | null;
  services: PortalService[];
  staff: PortalStaffMember[];
  currentUser: PortalUser | null;
  impersonatorId?: string | null;
  userAppointments: PortalAppointment[];
  userHistory: BootstrapHistoryPage;
  allAppointments: PortalAppointment[];
  notifications: PortalNotification[];
  allUsers: PortalUser[];
  error?: string;
}

export const EMPTY_BOOTSTRAP_PAYLOAD: BootstrapPayload = {
  settings: null,
  services: [],
  staff: [],
  currentUser: null,
  impersonatorId: null,
  userAppointments: [],
  userHistory: { items: [], nextCursor: null, hasMore: false, totalCount: 0 },
  allAppointments: [],
  notifications: [],
  allUsers: [],
};

export interface BootstrapOptions {
  publicOnly?: boolean;
  agendaFrom?: Date | null;
  agendaTo?: Date | null;
  usersLimit?: number;
}

export async function getBootstrapPayload(
  options: BootstrapOptions = {}
): Promise<BootstrapPayload> {
  let settings = await prisma.businessSettings.findFirst({
    where: { id: 1 },
  });

  if (!settings) {
    settings = await prisma.businessSettings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        name: "Mi Negocio",
        tagline: "Reserva tu cita en segundos",
        logoUrl: DEFAULT_BUSINESS_LOGO,
        addressText: "Av. Principal 123, Bolivia",
        googleMapsUrl:
          "https://www.google.com/maps/search/?api=1&query=-17.3895,-66.1568",
        phoneWhatsapp: "+59170000000",
        currencySymbol: "Bs",
        staffLabel: "Especialista",
        slotStepMin: 30,
        bookingHorizonDays: 7,
        minLeadTimeMinutes: 30,
        maxActiveBookings: 2,
        minCancelNoticeHours: 6,
        themePrimaryHex: "#1F1F23",
        themeSurfaceHex: "#9FA0A6",
      },
    });
  }

  const services = await prisma.service.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      staff: true,
    },
  });

  const currentUser = options.publicOnly ? null : await getCurrentUser();
  const isStaffOrAdmin =
    !options.publicOnly &&
    currentUser &&
    (currentUser.role === "ADMIN" || currentUser.role === "PROVIDER");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const staff = await prisma.staffProfile.findMany({
    where: isStaffOrAdmin ? {} : { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      // Linked account data (internal id, email, phone, role) is staff-only.
      // Public visitors only need the display profile (name, specialty, avatar).
      ...(isStaffOrAdmin
        ? {
            user: {
              select: {
                id: true,
                email: true,
                role: true,
                phone: true,
                pendingStaffUpgrade: true,
              },
            },
          }
        : {}),
      services: true,
      workingShifts: true,
      timeOffs: {
        where: {
          endAt: { gte: startOfToday },
        },
        orderBy: { startAt: "asc" },
      },
    },
  });

  // Public visitors and peer PROVIDERs never receive other doctors' private PII or internal TimeOff reasons.
  const viewerScope = {
    role: options.publicOnly ? null : currentUser?.role ?? null,
    userId: options.publicOnly ? null : currentUser?.id ?? null,
  };
  const safeStaff: PortalStaffMember[] = staff.map(
    (s) => sanitizeStaffForViewer(s, viewerScope) as PortalStaffMember
  );

  let userAppointments: PortalAppointment[] = [];
  let userHistory: BootstrapHistoryPage = {
    items: [],
    nextCursor: null,
    hasMore: false,
    totalCount: 0,
  };
  let notifications: PortalNotification[] = [];

  if (currentUser) {
    // Always fetch ALL unread notifications so no pending alert is ever dropped,
    // plus the 10 most recent read notifications for recent context.
    const [custData, unreadNotifs, readNotifs] = await Promise.all([
      getCustomerBootstrapAppointments(
        currentUser.id,
        settings?.minCancelNoticeHours ?? 6
      ),
      prisma.notification.findMany({
        where: { userId: currentUser.id, isRead: false },
        orderBy: { createdAt: "desc" },
      }),
      prisma.notification.findMany({
        where: { userId: currentUser.id, isRead: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    userAppointments = custData.userAppointments;
    userHistory = custData.userHistory;
    notifications = [...unreadNotifs, ...readNotifs];
  }

  let allAppointments: PortalAppointment[] = [];
  let allUsers: PortalUser[] = [];

  const agendaDateFilter =
    options.agendaFrom || options.agendaTo
      ? {
          startAt: {
            ...(options.agendaFrom ? { gte: options.agendaFrom } : {}),
            ...(options.agendaTo ? { lte: options.agendaTo } : {}),
          },
        }
      : {};

  // Expose full roster & global appointments only to ADMIN; PROVIDER receives only their own agenda
  if (currentUser && currentUser.role === "ADMIN") {
    allAppointments = await prisma.appointment.findMany({
      where: agendaDateFilter,
      include: {
        service: true,
        staff: true,
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isBlocked: true,
            noShowCount: true,
          },
        },
      },
      orderBy: { startAt: "asc" },
    });

    allUsers = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        isBlocked: true,
        noShowCount: true,
        completedCount: true,
        adminNotes: true,
      },
      ...(options.usersLimit && options.usersLimit > 0
        ? { take: options.usersLimit }
        : {}),
    });
  } else if (currentUser && currentUser.role === "PROVIDER") {
    const ownProfile = staff.find(
      (s) => (s as { userId?: string }).userId === currentUser.id
    );
    if (ownProfile) {
      allAppointments = await prisma.appointment.findMany({
        where: {
          staffId: ownProfile.id,
          ...agendaDateFilter,
        },
        include: {
          service: true,
          staff: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isBlocked: true,
              noShowCount: true,
            },
          },
        },
        orderBy: { startAt: "asc" },
      });
    }
  }

  // Never ship credential material or internal notes/invite hashes to the browser.
  const safeCurrentUser: PortalUser | null = currentUser
    ? (sanitizeUserForClient(currentUser) as PortalUser)
    : null;

  const impersonatorId =
    currentUser && currentUser.role === "PROVIDER"
      ? await getImpersonatorId()
      : null;

  return {
    settings,
    services,
    staff: safeStaff,
    currentUser: safeCurrentUser,
    impersonatorId,
    userAppointments,
    userHistory,
    allAppointments,
    notifications,
    allUsers,
  };
}
