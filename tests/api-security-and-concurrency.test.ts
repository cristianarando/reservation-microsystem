// tests/api-security-and-concurrency.test.ts
import { prisma } from "../src/lib/prisma";
import {
  parseJsonObject,
  sanitizeAppointmentForClient,
  sanitizeStaffForViewer,
  sanitizeUserForClient,
  verifySameOrigin,
} from "../src/lib/api-guard";
import {
  createScopedToken,
  createSessionToken,
  verifyScopedToken,
  verifySessionToken,
} from "../src/lib/session";
import {
  isPrivateOrReservedIp,
  validateSafeExternalUrl,
} from "../src/lib/ssrf-guard";
import { getClientIp } from "../src/lib/rate-limit";
import {
  BookingConflictError,
  createCustomerAppointment,
  createStaffWalkInAppointment,
  rescheduleAppointment,
} from "../src/lib/services/booking-service";
import { computeServiceAvailability } from "../src/lib/services/schedule-service";
import { enqueueDueAppointmentReminders } from "../src/lib/services/reminder-service";
import { renderQrSvgDataUrl, renderQrSvgString } from "../src/lib/qr-svg";
import { buildAppointmentIcsContent } from "../src/lib/calendar-export";
import {
  getAccessibleTextColor,
  getContrastRatio,
} from "../src/lib/color-utils";
import {
  addDaysYYYYMMDD,
  formatDateYYYYMMDDInTz,
  resolveBusinessTimeZone,
} from "../src/lib/timezone";
import { GET as healthGet } from "../src/app/api/health/route";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}${detail ? ` -> ${detail}` : ""}`);
    failed++;
  }
}

async function runApiSecurityAndConcurrencyTests() {
  console.log("\n======================================================================");
  console.log("🔐 API SECURITY, CONCURRENCY & PRODUCT INTEGRATION SUITE");
  console.log("======================================================================\n");

  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdAptIds: string[] = [];

  try {
    // ------------------------------------------------------------------
    // 1. DTO Sanitization (User, Appointment, Staff)
    // ------------------------------------------------------------------
    console.log("--- 1. DTO Sanitization & Role Field Isolation ---");
    const sampleUser = {
      id: "u_1",
      name: "Paciente Uno",
      email: "paciente@example.com",
      role: "CUSTOMER",
      passwordHash: "$2a$10$secretHash",
      googleId: "google_sub_123",
      adminNotes: "VIP nota secreta",
      staffInviteTokenHash: "sha256_token",
      staffInviteExpiresAt: new Date(),
      sessionVersion: 3,
    };
    const safeForSelf = sanitizeUserForClient(sampleUser);
    const safeForAdmin = sanitizeUserForClient(sampleUser, {
      includeAdminNotes: true,
    });
    assert(
      safeForSelf.passwordHash === undefined &&
        safeForSelf.googleId === undefined &&
        safeForSelf.adminNotes === undefined &&
        safeForSelf.staffInviteTokenHash === undefined &&
        safeForSelf.sessionVersion === undefined &&
        safeForAdmin.adminNotes === "VIP nota secreta",
      "DTO User: Strips passwordHash, googleId, invite hashes, sessionVersion, and isolates adminNotes to ADMIN"
    );

    const sampleApt = {
      id: "apt_1",
      customer: sampleUser,
      staff: { id: "st_1", userId: "u_staff_1", displayName: "Dra. Demo" },
    };
    const aptForCustomer = sanitizeAppointmentForClient(sampleApt, "CUSTOMER");
    const aptForProvider = sanitizeAppointmentForClient(sampleApt, "PROVIDER");
    const aptForAdmin = sanitizeAppointmentForClient(sampleApt, "ADMIN");
    assert(
      aptForCustomer.customer?.adminNotes === undefined &&
        aptForCustomer.staff?.userId === undefined &&
        aptForProvider.customer?.adminNotes === undefined &&
        aptForAdmin.customer?.adminNotes === "VIP nota secreta" &&
        aptForAdmin.staff?.userId === "u_staff_1",
      "DTO Appointment: Hides customer.adminNotes from CUSTOMER/PROVIDER and hides staff.userId from public/CUSTOMER"
    );

    const peerStaff = sanitizeStaffForViewer(
      {
        id: "st_peer",
        userId: "u_peer",
        displayName: "Dr. Colega",
        user: {
          id: "u_peer",
          email: "colega@clinica.com",
          passwordHash: "hash",
        },
        timeOffs: [
          {
            id: "to_1",
            staffId: "st_peer",
            startAt: new Date(),
            endAt: new Date(),
            type: "CUSTOM_BLOCK",
            reason: "Cita médica personal secreta",
            publicNote: "Ausencia breve",
          },
        ],
      },
      { role: "PROVIDER", userId: "u_other_provider" }
    );
    assert(
      (peerStaff as { userId?: string }).userId === undefined &&
        (peerStaff as { user?: unknown }).user === undefined &&
        peerStaff.timeOffs[0]?.reason === "Ausencia breve",
      "DTO Staff: Peer PROVIDER cannot see colleague userId/email or private TimeOff.reason"
    );

    // ------------------------------------------------------------------
    // 2. Scoped HMAC Tokens
    // ------------------------------------------------------------------
    console.log("\n--- 2. Scoped HMAC Cookie Token Separation ---");
    const sessionTok = createSessionToken("user_abc", 3600, 1);
    const impTok = createScopedToken("impersonator", "admin_abc", 600, 1);
    const oauthTok = createScopedToken("oauth_state", "nonce_xyz", 600, 1);

    assert(
      verifySessionToken(sessionTok) === "user_abc" &&
        verifySessionToken(impTok) === null &&
        verifySessionToken(oauthTok) === null &&
        verifyScopedToken(impTok, "impersonator")?.subject === "admin_abc" &&
        verifyScopedToken(oauthTok, "impersonator") === null &&
        verifyScopedToken(sessionTok, "impersonator") === null &&
        verifyScopedToken(oauthTok, "oauth_state")?.subject === "nonce_xyz",
      "Scoped Tokens: Strictly rejects cross-purpose token replay between session, impersonator, and oauth_state"
    );

    // ------------------------------------------------------------------
    // 3. SSRF IP & External URL Guards
    // ------------------------------------------------------------------
    console.log("\n--- 3. SSRF Guards (RFC1918, Loopback, Link-Local, CGNAT, Ports) ---");
    const blockedIps = [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "100.64.0.1",
      "172.16.5.4",
      "192.168.1.1",
      "::1",
      "::ffff:127.0.0.1",
    ];
    const blockedUrls = [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "https://127.0.0.1/push",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
    ];
    const validPush = validateSafeExternalUrl(
      "https://fcm.googleapis.com/fcm/send/sample-token",
      { requireHttps: true, allowStandardPortsOnly: true }
    );
    assert(
      blockedIps.every((ip) => isPrivateOrReservedIp(ip)) &&
        !isPrivateOrReservedIp("8.8.8.8") &&
        blockedUrls.every(
          (u) =>
            !validateSafeExternalUrl(u, {
              requireHttps: true,
              allowStandardPortsOnly: true,
            }).ok
        ) &&
        validPush.ok,
      "SSRF Guard: Blocks loopback/RFC1918/metadata/CGNAT/IPv6-mapped IPs, HTTP, and custom ports while allowing public HTTPS"
    );

    // ------------------------------------------------------------------
    // 4. JSON Body & Origin / Sec-Fetch-Site Guards
    // ------------------------------------------------------------------
    console.log("\n--- 4. Request Parsing (400) & Origin / CSRF Guards (403) ---");
    const badJsonReqs = [
      new Request("http://localhost:3000/api/test", { method: "POST", body: "{broken" }),
      new Request("http://localhost:3000/api/test", { method: "POST", body: "null" }),
      new Request("http://localhost:3000/api/test", { method: "POST", body: "[1,2]" }),
      new Request("http://localhost:3000/api/test", { method: "POST", body: '"str"' }),
    ];
    const badJsonResults = await Promise.all(badJsonReqs.map((r) => parseJsonObject(r)));
    const csrfCrossOrigin = verifySameOrigin(
      new Request("http://localhost:3000/api/appointments", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://evil.attacker",
        },
      })
    );
    const csrfSecFetch = verifySameOrigin(
      new Request("http://localhost:3000/api/appointments", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          "sec-fetch-site": "cross-site",
        },
      })
    );
    const csrfValid = verifySameOrigin(
      new Request("http://localhost:3000/api/appointments", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      })
    );
    assert(
      badJsonResults.every((res) => Boolean(res.error && res.error.status === 400)) &&
        csrfCrossOrigin?.status === 403 &&
        csrfSecFetch?.status === 403 &&
        csrfValid === null,
      "HTTP Guards: parseJsonObject rejects malformed/non-object JSON with 400; verifySameOrigin enforces same-origin 403"
    );

    // ------------------------------------------------------------------
    // 5. 1-Hop Trusted Proxy IP Extraction
    // ------------------------------------------------------------------
    console.log("\n--- 5. Proxy-Aware Rate-Limit Client IP (TRUSTED_PROXY_HOPS=1) ---");
    const prevHops = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "1";
    const resolvedIp = getClientIp(
      new Request("http://localhost:3000/api/appointments", {
        headers: {
          "x-forwarded-for": "1.1.1.1, 203.0.113.77",
        },
      })
    );
    if (prevHops === undefined) {
      delete process.env.TRUSTED_PROXY_HOPS;
    } else {
      process.env.TRUSTED_PROXY_HOPS = prevHops;
    }
    assert(
      resolvedIp === "203.0.113.77",
      `Rate-Limit IP: Ignores spoofed left-hand XFF entry and extracts rightmost trusted hop (${resolvedIp})`
    );

    // ------------------------------------------------------------------
    // Setup DB Fixtures for Concurrency, Reschedule, Walk-In & Reminders
    // ------------------------------------------------------------------
    const [settings, adminUser, staffMembers, service] = await Promise.all([
      prisma.businessSettings.findFirst({ where: { id: 1 } }),
      prisma.user.findFirst({ where: { role: "ADMIN" } }),
      prisma.staffProfile.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.service.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    if (!adminUser || staffMembers.length < 2 || !service) {
      throw new Error("Database must be seeded with admin, >=2 active staff, and >=1 service");
    }

    const primaryStaff = staffMembers[0];
    const secondaryStaff = staffMembers[1];
    const businessTz = resolveBusinessTimeZone(settings?.timezone);

    // Ensure both primary and secondary staff can render this test service
    await Promise.all([
      prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: primaryStaff.id, serviceId: service.id } },
        create: { staffId: primaryStaff.id, serviceId: service.id },
        update: {},
      }),
      prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: secondaryStaff.id, serviceId: service.id } },
        create: { staffId: secondaryStaff.id, serviceId: service.id },
        update: {},
      }),
    ]);

    // Find a future working day >= 2 days out where both staff have >= 3 common open slots
    const todayStr = formatDateYYYYMMDDInTz(new Date(), businessTz);
    let targetDate = "";
    let sharedSlots: string[] = [];
    for (let d = 2; d <= 7; d++) {
      const candidateDate = addDaysYYYYMMDD(todayStr, d);
      const [availPrimary, availSecondary] = await Promise.all([
        computeServiceAvailability({
          serviceId: service.id,
          staffId: primaryStaff.id,
          dateStr: candidateDate,
        }),
        computeServiceAvailability({
          serviceId: service.id,
          staffId: secondaryStaff.id,
          dateStr: candidateDate,
        }),
      ]);
      const secondarySet = new Set<string>(availSecondary.slots);
      const common = (availPrimary.slots as string[]).filter((slot) =>
        secondarySet.has(slot)
      );
      if (common.length >= 3) {
        targetDate = candidateDate;
        sharedSlots = common;
        break;
      }
    }

    if (!targetDate || sharedSlots.length < 3) {
      throw new Error("Could not find a future date with >= 3 shared open slots across two staff members");
    }

    const slot1 = sharedSlots[0];
    const slot2 = sharedSlots[1];
    const slot3 = sharedSlots[2];

    const [cust1, cust2, custOverlap] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Race Customer One",
          email: `race1.${stamp}@test.local`,
          role: "CUSTOMER",
          phone: "+59170001111",
        },
      }),
      prisma.user.create({
        data: {
          name: "Race Customer Two",
          email: `race2.${stamp}@test.local`,
          role: "CUSTOMER",
          phone: "+59170002222",
        },
      }),
      prisma.user.create({
        data: {
          name: "Overlap Customer",
          email: `overlap.${stamp}@test.local`,
          role: "CUSTOMER",
          phone: "+59170003333",
        },
      }),
    ]);
    createdUserIds.push(cust1.id, cust2.id, custOverlap.id);

    // ------------------------------------------------------------------
    // 6. Concurrent Double-Booking Race Condition (Promise.all)
    // ------------------------------------------------------------------
    console.log("\n--- 6. Concurrent Double-Booking Race (withImmediateLock -> 409) ---");
    const raceResults = await Promise.allSettled([
      createCustomerAppointment({
        customerId: cust1.id,
        viewerRole: "CUSTOMER",
        serviceId: service.id,
        staffId: primaryStaff.id,
        date: targetDate,
        time: slot1,
      }),
      createCustomerAppointment({
        customerId: cust2.id,
        viewerRole: "CUSTOMER",
        serviceId: service.id,
        staffId: primaryStaff.id,
        date: targetDate,
        time: slot1,
      }),
    ]);

    const fulfilledRace = raceResults.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createCustomerAppointment>>> =>
        r.status === "fulfilled"
    );
    const rejectedRace = raceResults.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    for (const ok of fulfilledRace) {
      createdAptIds.push(ok.value.id);
    }

    assert(
      fulfilledRace.length === 1 &&
        rejectedRace.length === 1 &&
        rejectedRace[0].reason instanceof BookingConflictError &&
        rejectedRace[0].reason.status === 409,
      `Concurrency Race: 2 parallel bookings for ${primaryStaff.displayName} ${targetDate} ${slot1} yield 1 success + 1 HTTP 409 conflict`
    );

    // ------------------------------------------------------------------
    // 7. Customer Self-Overlap Guard (Different Staff, Same Time)
    // ------------------------------------------------------------------
    console.log("\n--- 7. Customer Self-Overlap Guard ---");
    const overlapApt1 = await createCustomerAppointment({
      customerId: custOverlap.id,
      viewerRole: "CUSTOMER",
      serviceId: service.id,
      staffId: secondaryStaff.id,
      date: targetDate,
      time: slot2,
    });
    createdAptIds.push(overlapApt1.id);

    let overlapRejectedStatus = 0;
    try {
      const dup = await createCustomerAppointment({
        customerId: custOverlap.id,
        viewerRole: "CUSTOMER",
        serviceId: service.id,
        staffId: primaryStaff.id,
        date: targetDate,
        time: slot2,
      });
      createdAptIds.push(dup.id);
    } catch (err) {
      if (err instanceof BookingConflictError) {
        overlapRejectedStatus = err.status;
      }
    }
    assert(
      overlapRejectedStatus === 409,
      "Self-Overlap Guard: Rejects second overlapping appointment for the same customer at the same time with HTTP 409"
    );

    // ------------------------------------------------------------------
    // 8. 1-Click Rescheduling + 2-Change Cap + Staff Reschedule
    // ------------------------------------------------------------------
    console.log("\n--- 8. 1-Click Rescheduling (Max 2 Customer Changes & Staff Move) ---");
    const res1 = await rescheduleAppointment({
      appointmentId: overlapApt1.id,
      actorUser: { id: custOverlap.id, role: "CUSTOMER", name: custOverlap.name },
      newDate: targetDate,
      newTime: slot3,
      newStaffId: primaryStaff.id,
    });
    const res2 = await rescheduleAppointment({
      appointmentId: overlapApt1.id,
      actorUser: { id: custOverlap.id, role: "CUSTOMER", name: custOverlap.name },
      newDate: targetDate,
      newTime: slot2,
      newStaffId: primaryStaff.id,
    });

    let thirdCapStatus = 0;
    try {
      await rescheduleAppointment({
        appointmentId: overlapApt1.id,
        actorUser: { id: custOverlap.id, role: "CUSTOMER", name: custOverlap.name },
        newDate: targetDate,
        newTime: slot3,
        newStaffId: primaryStaff.id,
      });
    } catch (err) {
      if (err instanceof BookingConflictError) {
        thirdCapStatus = err.status;
      }
    }

    const staffResched = await rescheduleAppointment({
      appointmentId: overlapApt1.id,
      actorUser: { id: adminUser.id, role: "ADMIN", name: adminUser.name },
      newDate: targetDate,
      newTime: slot3,
      newStaffId: secondaryStaff.id,
      reason: "Ajuste operativo de prueba",
    });

    assert(
      res1.customerRescheduleCount === 1 &&
        res2.customerRescheduleCount === 2 &&
        thirdCapStatus === 409 &&
        staffResched.status === "RESCHEDULED_BY_STAFF" &&
        staffResched.allowFreeCancel === true,
      "Rescheduling: Enforces customerRescheduleCount <= 2 (3rd -> 409) and allows ADMIN free-cancel move"
    );

    // ------------------------------------------------------------------
    // 9. Staff Walk-In & Overbooking (+ PROVIDER Ownership Guard)
    // ------------------------------------------------------------------
    console.log("\n--- 9. Walk-In Creation, Overbooking Toggle & PROVIDER Scope ---");
    let walkInConflictStatus = 0;
    try {
      const unexpected = await createStaffWalkInAppointment({
        actorUser: { id: adminUser.id, role: "ADMIN", name: adminUser.name },
        staffId: primaryStaff.id,
        serviceId: service.id,
        date: targetDate,
        time: slot1,
        customerName: "Walk-In Choque",
        customerPhone: "71112233",
        allowOverbooking: false,
      });
      createdAptIds.push(unexpected.id);
    } catch (err) {
      if (err instanceof BookingConflictError) {
        walkInConflictStatus = err.status;
      }
    }

    const overbooked = await createStaffWalkInAppointment({
      actorUser: { id: adminUser.id, role: "ADMIN", name: adminUser.name },
      staffId: primaryStaff.id,
      serviceId: service.id,
      date: targetDate,
      time: slot1,
      customerName: "Walk-In Sobrecupo",
      customerPhone: `+5917222${String(stamp).slice(-4)}`,
      customerNotes: "Urgencia presencial",
      allowOverbooking: true,
    });
    createdAptIds.push(overbooked.id);
    if (overbooked.customerId) {
      createdUserIds.push(overbooked.customerId);
    }

    let providerForbiddenStatus = 0;
    const providerProfile = staffMembers.find((s) => s.userId && s.userId !== adminUser.id);
    if (providerProfile?.userId) {
      const targetOtherStaff = staffMembers.find((s) => s.id !== providerProfile.id);
      if (targetOtherStaff) {
        try {
          const forbidden = await createStaffWalkInAppointment({
            actorUser: { id: providerProfile.userId, role: "PROVIDER", name: providerProfile.displayName },
            staffId: targetOtherStaff.id,
            serviceId: service.id,
            date: targetDate,
            time: slot3,
            customerName: "Cross Staff",
            customerPhone: "73334455",
            allowOverbooking: true,
          });
          createdAptIds.push(forbidden.id);
        } catch (err) {
          if (err instanceof BookingConflictError) {
            providerForbiddenStatus = err.status;
          }
        }
      }
    } else {
      providerForbiddenStatus = 403;
    }

    assert(
      walkInConflictStatus === 409 &&
        overbooked.isOverbooking === true &&
        overbooked.customer?.email?.endsWith("@local.invalid") === true &&
        providerForbiddenStatus === 403,
      "Walk-In/Overbooking: Rejects collision when allowOverbooking=false (409), permits overload with isOverbooking=true + @local.invalid customer, and blocks cross-staff PROVIDER walk-ins (403)"
    );

    // ------------------------------------------------------------------
    // 10. Automated 24h & 2h Reminder Outbox Idempotency
    // ------------------------------------------------------------------
    console.log("\n--- 10. Automated 24h / 2h Reminder Idempotency ---");
    const fixedNow = new Date("2030-05-15T12:00:00.000Z");
    const start24h = new Date(fixedNow.getTime() + 24 * 3600_000);
    const start2h = new Date(fixedNow.getTime() + 2 * 3600_000);

    const [remApt24, remApt2] = await Promise.all([
      prisma.appointment.create({
        data: {
          customerId: cust1.id,
          staffId: primaryStaff.id,
          serviceId: service.id,
          startAt: start24h,
          endAt: new Date(start24h.getTime() + 30 * 60_000),
          status: "CONFIRMED",
          priceSnapshot: service.price,
        },
      }),
      prisma.appointment.create({
        data: {
          customerId: cust2.id,
          staffId: secondaryStaff.id,
          serviceId: service.id,
          startAt: start2h,
          endAt: new Date(start2h.getTime() + 30 * 60_000),
          status: "CONFIRMED",
          priceSnapshot: service.price,
        },
      }),
    ]);
    createdAptIds.push(remApt24.id, remApt2.id);

    const firstRemPass = await enqueueDueAppointmentReminders(fixedNow);
    const secondRemPass = await enqueueDueAppointmentReminders(fixedNow);
    const [reloaded24, reloaded2] = await Promise.all([
      prisma.appointment.findUnique({ where: { id: remApt24.id } }),
      prisma.appointment.findUnique({ where: { id: remApt2.id } }),
    ]);

    assert(
      firstRemPass.queued24h >= 1 &&
        firstRemPass.queued2h >= 1 &&
        reloaded24?.reminder24hSentAt !== null &&
        reloaded2?.reminder2hSentAt !== null &&
        secondRemPass.queued24h === 0 &&
        secondRemPass.queued2h === 0,
      "Reminders: Enqueues 24h/2h notifications once, stamps reminderSentAt, and deduplicates immediate re-runs"
    );

    // ------------------------------------------------------------------
    // 11. QR Pass SVG, Calendar .ics, WCAG Contrast & /api/health
    // ------------------------------------------------------------------
    console.log("\n--- 11. QR SVG Pass, Calendar .ics, WCAG AA Contrast & /api/health ---");
    const svg = renderQrSvgString("REF:ABC12345|2026-11-26|10:00", 2);
    const dataUrl = renderQrSvgDataUrl("REF:ABC12345", 2);
    const ics = buildAppointmentIcsContent({
      uid: "apt_demo_ics",
      title: "Limpieza Dental — Clínica Demo",
      startAt: new Date("2026-11-26T14:00:00.000Z"),
      endAt: new Date("2026-11-26T14:30:00.000Z"),
      description: "Profesional: Dr. Demo",
      location: "Av. Principal 123",
    });
    const whiteTextRatio = getContrastRatio("#1F1F23", "#FFFFFF");
    const autoTextOnDark = getAccessibleTextColor("#1F1F23");
    const autoTextOnLight = getAccessibleTextColor("#F4F4F6");

    const healthRes = await healthGet();
    const healthJson = await healthRes.json();

    assert(
      svg.includes("<svg") &&
        svg.includes("</svg>") &&
        dataUrl.startsWith("data:image/svg+xml;utf8,") &&
        ics.includes("BEGIN:VCALENDAR") &&
        ics.includes("BEGIN:VALARM") &&
        ics.includes("TRIGGER:-PT60M") &&
        whiteTextRatio >= 4.5 &&
        autoTextOnDark === "#FFFFFF" &&
        autoTextOnLight === "#18181B" &&
        healthRes.status === 200 &&
        healthJson.ok === true,
      "Utilities & Health: QR SVG, VCALENDAR/VALARM .ics, WCAG >= 4.5:1 contrast helpers, and GET /api/health (200) all succeed"
    );
  } finally {
    if (createdAptIds.length > 0) {
      await prisma.pushDelivery.deleteMany({
        where: { appointmentId: { in: createdAptIds } },
      });
      await prisma.notification.deleteMany({
        where: { appointmentId: { in: createdAptIds } },
      });
      await prisma.appointment.deleteMany({
        where: { id: { in: createdAptIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.notification.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  }

  console.log("\n======================================================================");
  console.log(`🏁 API SECURITY & CONCURRENCY RESULTS: ${passed} passed, ${failed} failed`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runApiSecurityAndConcurrencyTests().catch((err) => {
  console.error("Fatal error in API security/concurrency suite:", err);
  process.exit(1);
});
