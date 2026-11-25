import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  addDaysYYYYMMDD,
  formatDateYYYYMMDDInTz,
  getDayOfWeekInTz,
  parseDateAndTimeInTz,
} from "../src/lib/timezone";

const prisma = new PrismaClient();

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DESTRUCTIVE_SEED !== "true"
  ) {
    throw new Error(
      "Refusing to run destructive seed in production without ALLOW_DESTRUCTIVE_SEED=true."
    );
  }

  console.log("🌱 Starting seed...");

  await prisma.pushDelivery.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.timeOff.deleteMany();
  await prisma.workingShift.deleteMany();
  await prisma.staffService.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staffProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.businessSettings.deleteMany();

  const businessTz = "America/La_Paz";

  // 1. Business Settings
  await prisma.businessSettings.create({
    data: {
      id: 1,
      name: "Clínica Dental & Estética Sonrisa",
      tagline: "Atención odontológica y estética de primer nivel",
      logoUrl:
        "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=150&auto=format&fit=crop&q=80",
      addressText: "Av. Simón López esq. Av. Beijing, Cochabamba, Bolivia",
      googleMapsUrl:
        "https://www.google.com/maps/search/?api=1&query=-17.3713,-66.1742",
      phoneWhatsapp: "+591 70712345",
      currencySymbol: "Bs",
      staffLabel: "Doctor(a)",
      slotStepMin: 30,
      bookingHorizonDays: 7,
      minLeadTimeMinutes: 30,
      maxActiveBookings: 2,
      minCancelNoticeHours: 6,
      themePrimaryHex: "#1F1F23",
      themeSurfaceHex: "#9FA0A6",
      timezone: businessTz,
      pushHideDetails: false,
    },
  });

  // 2. Users (Admin, Staff, Customers)
  const defaultAdminPassword = await bcrypt.hash("Admin123!", 10);
  const defaultStaffPassword = await bcrypt.hash("Doctor123!", 10);
  const defaultCustomerPassword = await bcrypt.hash("Cliente123!", 10);

  const userAdmin = await prisma.user.create({
    data: {
      email: "alejandro@sonrisa.com",
      passwordHash: defaultAdminPassword,
      googleId: "google_admin_alejandro",
      name: "Dr. Alejandro Vega",
      phone: "+591 70711122",
      role: "ADMIN",
      avatarUrl:
        "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80",
    },
  });

  const userSofia = await prisma.user.create({
    data: {
      email: "sofia@sonrisa.com",
      passwordHash: defaultStaffPassword,
      googleId: "google_sofia_rios",
      name: "Dra. Sofía Ríos",
      phone: "+591 70733344",
      role: "PROVIDER",
      avatarUrl:
        "https://images.unsplash.com/photo-1594824813583-e072f44c4e78?w=150&auto=format&fit=crop&q=80",
    },
  });

  const userMarcos = await prisma.user.create({
    data: {
      email: "marcos@sonrisa.com",
      passwordHash: defaultStaffPassword,
      googleId: "google_marcos_paz",
      name: "Dr. Marcos Paz",
      phone: "+591 70755566",
      role: "PROVIDER",
      avatarUrl:
        "https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150&auto=format&fit=crop&q=80",
    },
  });

  const customerCarlos = await prisma.user.create({
    data: {
      email: "carlos.cliente@gmail.com",
      passwordHash: defaultCustomerPassword,
      googleId: "google_carlos_mendoza",
      name: "Carlos Mendoza",
      phone: "+591 70788899",
      role: "CUSTOMER",
      completedCount: 3,
      noShowCount: 0,
    },
  });

  await prisma.user.create({
    data: {
      email: "lucia.valdez@gmail.com",
      passwordHash: defaultCustomerPassword,
      googleId: "google_lucia_valdez",
      name: "Lucía Valdez",
      phone: "+591 70777788",
      role: "CUSTOMER",
      completedCount: 1,
      noShowCount: 0,
    },
  });

  // 3. Staff Profiles
  const staffAlejandro = await prisma.staffProfile.create({
    data: {
      userId: userAdmin.id,
      displayName: "Dr. Alejandro Vega",
      specialtyTitle: "Odontología Integral & Cirugía",
      avatarUrl: userAdmin.avatarUrl,
      customHorizonDays: 7,
      customLeadTimeMin: 30,
      sortOrder: 1,
    },
  });

  const staffSofia = await prisma.staffProfile.create({
    data: {
      userId: userSofia.id,
      displayName: "Dra. Sofía Ríos",
      specialtyTitle: "Ortodoncia & Diseño de Sonrisa",
      avatarUrl: userSofia.avatarUrl,
      customHorizonDays: 7,
      customLeadTimeMin: 30,
      sortOrder: 2,
    },
  });

  const staffMarcos = await prisma.staffProfile.create({
    data: {
      userId: userMarcos.id,
      displayName: "Dr. Marcos Paz",
      specialtyTitle: "Endodoncia & Urgencias 24h",
      avatarUrl: userMarcos.avatarUrl,
      customHorizonDays: 7,
      customLeadTimeMin: 15,
      sortOrder: 3,
    },
  });

  // 4. Services
  const s1 = await prisma.service.create({
    data: {
      name: "Limpieza Dental & Profilaxis",
      description: "Eliminación de sarro por ultrasonido y pulido dental completo.",
      durationMin: 30,
      bufferAfterMin: 0,
      price: 180.0,
      sortOrder: 1,
    },
  });

  const s2 = await prisma.service.create({
    data: {
      name: "Consulta & Diagnóstico General",
      description:
        "Valoración clínica completa con cámara intraoral y plan de tratamiento.",
      durationMin: 30,
      bufferAfterMin: 0,
      price: 120.0,
      sortOrder: 2,
    },
  });

  const s3 = await prisma.service.create({
    data: {
      name: "Ajuste de Ortodoncia / Brackets",
      description: "Control mensual de ortodoncia, cambio de arcos y ligas.",
      durationMin: 45,
      bufferAfterMin: 0,
      price: 250.0,
      sortOrder: 3,
    },
  });

  const s4 = await prisma.service.create({
    data: {
      name: "Blanqueamiento Led Avanzado",
      description:
        "Aclaramiento dental en una sola sesión de 60 minutos con lámpara LED.",
      durationMin: 60,
      bufferAfterMin: 0,
      price: 550.0,
      sortOrder: 4,
    },
  });

  // 5. Connect Staff to Services
  await prisma.staffService.createMany({
    data: [
      { staffId: staffAlejandro.id, serviceId: s1.id },
      { staffId: staffAlejandro.id, serviceId: s2.id },
      { staffId: staffAlejandro.id, serviceId: s4.id },
      { staffId: staffSofia.id, serviceId: s1.id },
      { staffId: staffSofia.id, serviceId: s2.id },
      { staffId: staffSofia.id, serviceId: s3.id },
      { staffId: staffSofia.id, serviceId: s4.id },
      { staffId: staffMarcos.id, serviceId: s1.id },
      { staffId: staffMarcos.id, serviceId: s2.id },
    ],
  });

  // 6. Working Shifts (0=Dom .. 6=Sab)
  await prisma.workingShift.createMany({
    data: [
      // Dr. Alejandro
      { staffId: staffAlejandro.id, dayOfWeek: 1, startTime: "08:30", endTime: "13:00" },
      { staffId: staffAlejandro.id, dayOfWeek: 2, startTime: "14:00", endTime: "19:30" },
      { staffId: staffAlejandro.id, dayOfWeek: 3, startTime: "09:00", endTime: "13:00" },
      { staffId: staffAlejandro.id, dayOfWeek: 3, startTime: "15:00", endTime: "19:00" },
      { staffId: staffAlejandro.id, dayOfWeek: 4, startTime: "09:00", endTime: "17:00" },
      { staffId: staffAlejandro.id, dayOfWeek: 5, startTime: "09:00", endTime: "16:00" },
      { staffId: staffAlejandro.id, dayOfWeek: 6, startTime: "09:00", endTime: "13:00" },

      // Dra. Sofía
      { staffId: staffSofia.id, dayOfWeek: 1, startTime: "10:00", endTime: "18:00" },
      { staffId: staffSofia.id, dayOfWeek: 2, startTime: "10:00", endTime: "18:00" },
      { staffId: staffSofia.id, dayOfWeek: 3, startTime: "10:00", endTime: "18:00" },
      { staffId: staffSofia.id, dayOfWeek: 4, startTime: "10:00", endTime: "18:00" },
      { staffId: staffSofia.id, dayOfWeek: 5, startTime: "10:00", endTime: "18:00" },
      { staffId: staffSofia.id, dayOfWeek: 6, startTime: "10:00", endTime: "14:00" },

      // Dr. Marcos (Urgencias / Tarde-Noche)
      { staffId: staffMarcos.id, dayOfWeek: 1, startTime: "15:00", endTime: "22:00" },
      { staffId: staffMarcos.id, dayOfWeek: 2, startTime: "15:00", endTime: "22:00" },
      { staffId: staffMarcos.id, dayOfWeek: 4, startTime: "15:00", endTime: "22:00" },
      { staffId: staffMarcos.id, dayOfWeek: 5, startTime: "20:00", endTime: "23:59" },
      { staffId: staffMarcos.id, dayOfWeek: 6, startTime: "00:00", endTime: "04:00" },
    ],
  });

  // 7. Sample Upcoming Appointment for Carlos anchored to Dr. Alejandro's next valid shift
  const todayStr = formatDateYYYYMMDDInTz(new Date(), businessTz);
  let targetDateStr = addDaysYYYYMMDD(todayStr, 1);
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = addDaysYYYYMMDD(todayStr, offset);
    const dow = getDayOfWeekInTz(candidate, businessTz);
    if ([1, 3, 4, 5, 6].includes(dow)) {
      targetDateStr = candidate;
      break;
    }
  }
  const sampleStart = parseDateAndTimeInTz(targetDateStr, "10:00", businessTz);
  const sampleEnd = new Date(
    sampleStart.getTime() + (s1.durationMin + s1.bufferAfterMin) * 60_000
  );

  await prisma.appointment.create({
    data: {
      customerId: customerCarlos.id,
      staffId: staffAlejandro.id,
      serviceId: s1.id,
      startAt: sampleStart,
      endAt: sampleEnd,
      status: "CONFIRMED",
      priceSnapshot: s1.price,
      customerNotes: "Sensibilidad en encías inferiores",
    },
  });

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
