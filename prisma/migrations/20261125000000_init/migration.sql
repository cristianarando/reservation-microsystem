-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT 'Mi Negocio',
    "tagline" TEXT NOT NULL DEFAULT 'Reserva tu cita en segundos',
    "logoUrl" TEXT,
    "addressText" TEXT NOT NULL DEFAULT 'Av. Principal 123, Bolivia',
    "googleMapsUrl" TEXT NOT NULL DEFAULT 'https://maps.google.com',
    "phoneWhatsapp" TEXT NOT NULL DEFAULT '+59170000000',
    "currencySymbol" TEXT NOT NULL DEFAULT 'Bs',
    "staffLabel" TEXT NOT NULL DEFAULT 'Especialista',
    "slotStepMin" INTEGER NOT NULL DEFAULT 30,
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 7,
    "minLeadTimeMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxActiveBookings" INTEGER NOT NULL DEFAULT 2,
    "minCancelNoticeHours" INTEGER NOT NULL DEFAULT 6,
    "themePrimaryHex" TEXT NOT NULL DEFAULT '#1F1F23',
    "themeSurfaceHex" TEXT NOT NULL DEFAULT '#9FA0A6',
    "timezone" TEXT NOT NULL DEFAULT 'America/La_Paz',
    "pushHideDetails" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "noShowCount" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "adminNotes" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "pendingStaffUpgrade" BOOLEAN NOT NULL DEFAULT false,
    "staffInviteTokenHash" TEXT,
    "staffInviteExpiresAt" DATETIME,
    "notifyAllStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "specialtyTitle" TEXT NOT NULL DEFAULT 'Especialista',
    "avatarUrl" TEXT,
    "customHorizonDays" INTEGER,
    "customLeadTimeMin" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "StaffProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
    "price" REAL NOT NULL DEFAULT 25.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "StaffService" (
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    PRIMARY KEY ("staffId", "serviceId"),
    CONSTRAINT "StaffService_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StaffService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkingShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "WorkingShift_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CUSTOM_BLOCK',
    "reason" TEXT,
    "publicNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeOff_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "previousStartAt" DATETIME,
    "staffMoveReason" TEXT,
    "allowFreeCancel" BOOLEAN NOT NULL DEFAULT false,
    "rescheduleVersion" INTEGER NOT NULL DEFAULT 0,
    "customerRescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "isOverbooking" BOOLEAN NOT NULL DEFAULT false,
    "reminder24hSentAt" DATETIME,
    "reminder2hSentAt" DATETIME,
    "cancelledBy" TEXT,
    "cancelledByUserId" TEXT,
    "priceSnapshot" REAL NOT NULL,
    "customerNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "eventKey" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastConfirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessAt" DATETIME,
    "lastErrorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "appointmentId" TEXT,
    "notificationId" TEXT,
    "recipientUserId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedUntil" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PushDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PushDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "PushSubscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_key" ON "StaffProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkingShift_staffId_dayOfWeek_idx" ON "WorkingShift"("staffId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "TimeOff_staffId_startAt_endAt_idx" ON "TimeOff"("staffId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Appointment_staffId_startAt_endAt_idx" ON "Appointment"("staffId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "Appointment_customerId_status_startAt_idx" ON "Appointment"("customerId", "status", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_startAt_idx" ON "Appointment"("startAt");

-- CreateIndex
CREATE INDEX "Appointment_status_startAt_idx" ON "Appointment"("status", "startAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_eventKey_idx" ON "Notification"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_status_idx" ON "PushSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PushDelivery_recipientUserId_status_idx" ON "PushDelivery"("recipientUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PushDelivery_eventKey_recipientUserId_subscriptionId_key" ON "PushDelivery"("eventKey", "recipientUserId", "subscriptionId");

