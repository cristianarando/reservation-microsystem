// src/lib/web-push.ts
import {
  createCipheriv,
  createECDH,
  createHash,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign as cryptoSign,
} from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PushEventType =
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CANCELLED"
  | "MASS_CANCELLATION"
  | "CUSTOMER_CANCELLED"
  | "APPOINTMENT_RESCHEDULED"
  | "TEST_PUSH";

export interface VapidKeys {
  publicKey: string; // Base64url uncompressed 65-byte P-256 public key
  privateKey: string; // Base64url 32-byte P-256 private scalar
  subject: string;
}

export interface PushTransportRequest {
  deliveryId: string;
  endpoint: string;
  headers: Record<string, string>;
  body: Buffer;
  cleartextPayload: {
    title: string;
    body: string;
    tag: string;
    url: string;
    eventKey: string;
    eventType: string;
    timestamp: number;
  };
}

export interface PushTransportResponse {
  status: number;
  retryAfterSec?: number | null;
  errorText?: string;
}

export type PushTransport = (
  req: PushTransportRequest
) => Promise<PushTransportResponse>;

const globalForPush = globalThis as unknown as {
  cachedVapidKeys?: VapidKeys;
  pushDispatcherPaused?: boolean;
  customPushTransport?: PushTransport | null;
  pushWorkerStarted?: boolean;
};

function resolveDefaultVapidSubject(): string {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit && (explicit.startsWith("mailto:") || explicit.startsWith("https://"))) {
    return explicit;
  }
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  if (
    appUrl.startsWith("https://") &&
    !appUrl.includes("tudominio.com") &&
    !appUrl.includes("yourdomain.com")
  ) {
    try {
      return new URL(appUrl).origin;
    } catch {
      // Fall through to default mailto
    }
  }
  return "mailto:soporte@minegocio.app";
}

/**
 * Generates or loads a deterministic P-256 VAPID keypair.
 * In production, uses VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars if configured;
 * otherwise derives a stable P-256 keypair from SESSION_SECRET so keys remain consistent across restarts.
 */
export function getVapidKeys(): VapidKeys {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = resolveDefaultVapidSubject();

  if (envPub && envPriv) {
    return { publicKey: envPub, privateKey: envPriv, subject };
  }

  if (globalForPush.cachedVapidKeys) {
    return globalForPush.cachedVapidKeys;
  }

  const ecdh = createECDH("prime256v1");
  const seedMaterial =
    process.env.SESSION_SECRET || "reservas-default-vapid-seed-material-v1";
  const deterministicPriv = createHash("sha256").update(seedMaterial).digest();
  ecdh.setPrivateKey(deterministicPriv);

  const rawPriv = ecdh.getPrivateKey();
  const paddedPriv =
    rawPriv.length === 32
      ? rawPriv
      : Buffer.concat([
          Buffer.alloc(Math.max(0, 32 - rawPriv.length)),
          rawPriv,
        ]).subarray(-32);

  const keys: VapidKeys = {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: paddedPriv.toString("base64url"),
    subject,
  };
  globalForPush.cachedVapidKeys = keys;
  return keys;
}

/**
 * Starts a lightweight singleton background poller (30s interval) in long-running Node server deployments
 * to retry temporary Web Push failures and reclaim stale leases without relying on request timers.
 */
export function startPushDispatcherWorker(intervalMs = 30_000): void {
  if (globalForPush.pushWorkerStarted) return;
  globalForPush.pushWorkerStarted = true;

  const timer = setInterval(() => {
    if (isPushDispatcherPaused()) return;
    void dispatchPendingPushDeliveries({ limit: 25 }).catch((err) => {
      console.error("[WebPush Worker] Dispatch tick error:", err instanceof Error ? err.message : "unknown");
    });
  }, intervalMs);

  // Do not block graceful process shutdown
  if (typeof timer.unref === "function") {
    timer.unref();
  }
}

/**
 * Validates a browser PushSubscription JSON payload before storing in Prisma.
 */
export function validatePushSubscriptionInput(raw: unknown):
  | {
      ok: true;
      endpoint: string;
      p256dh: string;
      auth: string;
    }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Formato de suscripción push inválido." };
  }

  const obj = raw as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  if (
    typeof obj.endpoint !== "string" ||
    obj.endpoint.trim().length < 16 ||
    obj.endpoint.length > 2048
  ) {
    return { ok: false, error: "Endpoint de suscripción push inválido." };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(obj.endpoint.trim());
  } catch {
    return { ok: false, error: "URL del servicio push inválida." };
  }

  if (parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      error: "El servicio Web Push requiere un destino HTTPS seguro.",
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      ok: false,
      error: "El endpoint push no debe incluir credenciales en la URL.",
    };
  }

  const host = parsedUrl.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    host === "[::1]"
  ) {
    return {
      ok: false,
      error: "El destino del servicio push no puede apuntar a una red privada.",
    };
  }

  const rawP256dh =
    typeof obj.keys?.p256dh === "string" ? obj.keys.p256dh.trim() : "";
  const rawAuth =
    typeof obj.keys?.auth === "string" ? obj.keys.auth.trim() : "";

  if (!rawP256dh || !rawAuth || rawP256dh.length > 256 || rawAuth.length > 128) {
    return { ok: false, error: "Faltan las claves criptográficas p256dh o auth." };
  }

  let p256dhBuf: Buffer;
  let authBuf: Buffer;
  try {
    p256dhBuf = Buffer.from(rawP256dh, "base64url");
    authBuf = Buffer.from(rawAuth, "base64url");
  } catch {
    return { ok: false, error: "Codificación de claves push inválida." };
  }

  // Uncompressed P-256 public key is 65 bytes starting with 0x04
  if (p256dhBuf.length !== 65 || p256dhBuf[0] !== 0x04) {
    return {
      ok: false,
      error: "La clave pública p256dh del dispositivo no es válida.",
    };
  }

  if (authBuf.length < 16) {
    return {
      ok: false,
      error: "El secreto de autenticación Web Push es demasiado corto.",
    };
  }

  return {
    ok: true,
    endpoint: parsedUrl.toString(),
    p256dh: p256dhBuf.toString("base64url"),
    auth: authBuf.toString("base64url"),
  };
}

/**
 * Creates an RFC 8292 VAPID Authorization header (ES256 JWT).
 */
export function createVapidAuthHeader(
  endpointUrl: string,
  keys: VapidKeys = getVapidKeys()
): string {
  const parsed = new URL(endpointUrl);
  const audience = `${parsed.protocol}//${parsed.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const headerB64 = Buffer.from(
    JSON.stringify({ typ: "JWT", alg: "ES256" })
  ).toString("base64url");
  const payloadB64 = Buffer.from(
    JSON.stringify({
      aud: audience,
      exp,
      sub: keys.subject,
    })
  ).toString("base64url");

  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pubBytes = Buffer.from(keys.publicKey, "base64url");
  const x = pubBytes.subarray(1, 33).toString("base64url");
  const y = pubBytes.subarray(33, 65).toString("base64url");

  const privateKeyObj = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d: keys.privateKey,
    },
    format: "jwk",
  });

  const signature = cryptoSign("sha256", Buffer.from(unsignedToken), {
    key: privateKeyObj,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");

  return `vapid t=${unsignedToken}.${signature}, k=${keys.publicKey}`;
}

/**
 * Encrypts a JSON notification payload according to RFC 8291 (aes128gcm content encoding).
 */
export function encryptWebPushPayload(
  plaintext: string,
  clientPublicKeyB64: string,
  clientAuthB64: string
): Buffer {
  const clientPublicKey = Buffer.from(clientPublicKeyB64, "base64url");
  const clientAuth = Buffer.from(clientAuthB64, "base64url");

  //Verify client public key is valid on P-256 curve
  createPublicKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: clientPublicKey.subarray(1, 33).toString("base64url"),
      y: clientPublicKey.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });

  const serverECDH = createECDH("prime256v1");
  serverECDH.generateKeys();
  const serverPublicKey = serverECDH.getPublicKey();
  const sharedSecret = serverECDH.computeSecret(clientPublicKey);

  const salt = randomBytes(16);

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    clientPublicKey,
    serverPublicKey,
  ]);
  const ikm = Buffer.from(
    hkdfSync("sha256", sharedSecret, clientAuth, keyInfo, 32)
  );

  const cekInfo = Buffer.from("Content-Encoding: aes128gcm\0", "utf8");
  const contentEncryptionKey = Buffer.from(
    hkdfSync("sha256", ikm, salt, cekInfo, 16)
  );

  const nonceInfo = Buffer.from("Content-Encoding: nonce\0", "utf8");
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, nonceInfo, 12));

  // Add 0x02 record delimiter at end of plaintext per RFC 8188 / RFC 8291
  const paddedPlaintext = Buffer.concat([
    Buffer.from(plaintext, "utf8"),
    Buffer.from([2]),
  ]);

  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([
    cipher.update(paddedPlaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  // RFC 8188 aes128gcm binary header: salt (16B) | rs (4B uint32BE = 4096) | idlen (1B = 65) | keyid (65B serverPublicKey)
  const rsBuf = Buffer.alloc(4);
  rsBuf.writeUInt32BE(4096, 0);
  const idLenBuf = Buffer.from([serverPublicKey.length]);

  return Buffer.concat([salt, rsBuf, idLenBuf, serverPublicKey, encrypted]);
}

/**
 * Enqueues pending Web Push deliveries inside an active Prisma transaction.
 * Guarantees idempotency via unique (eventKey, recipientUserId, subscriptionId) and suppresses self-actions.
 */
export async function enqueuePushDeliveriesInTx(
  tx: Prisma.TransactionClient,
  params: {
    eventKey: string;
    eventType: PushEventType;
    appointmentId?: string | null;
    notificationId?: string | null;
    recipientUserIds: string[];
    actorUserId?: string | null;
    title: string;
    body: string;
    targetPath: string;
    tag?: string;
    ttlSeconds?: number;
  }
) {
  const uniqueRecipients = Array.from(
    new Set(
      params.recipientUserIds.filter(
        (uid) => Boolean(uid) && uid !== params.actorUserId
      )
    )
  );

  if (uniqueRecipients.length === 0) return [];

  const subscriptions = await tx.pushSubscription.findMany({
    where: {
      userId: { in: uniqueRecipients },
      status: "ACTIVE",
    },
  });

  if (subscriptions.length === 0) return [];

  const ttlMs = (params.ttlSeconds ?? 24 * 3600) * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const tag = params.tag || params.eventKey;
  const createdDeliveries = [];

  for (const sub of subscriptions) {
    const existing = await tx.pushDelivery.findUnique({
      where: {
        eventKey_recipientUserId_subscriptionId: {
          eventKey: params.eventKey,
          recipientUserId: sub.userId,
          subscriptionId: sub.id,
        },
      },
    });
    if (existing) {
      createdDeliveries.push(existing);
      continue;
    }

    const delivery = await tx.pushDelivery.create({
      data: {
        eventKey: params.eventKey,
        eventType: params.eventType,
        appointmentId: params.appointmentId ?? null,
        notificationId: params.notificationId ?? null,
        recipientUserId: sub.userId,
        subscriptionId: sub.id,
        title: params.title,
        body: params.body,
        targetPath: params.targetPath,
        tag,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        expiresAt,
      },
    });
    createdDeliveries.push(delivery);
  }

  return createdDeliveries;
}

/**
 * Default HTTPS Web Push transport.
 */
async function defaultHttpPushTransport(
  req: PushTransportRequest
): Promise<PushTransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let targetOrigin = "push-service";
  try {
    targetOrigin = new URL(req.endpoint).origin;
  } catch {
    // Ignore malformed origin
  }
  try {
    const res = await fetch(req.endpoint, {
      method: "POST",
      headers: req.headers,
      body: new Uint8Array(req.body),
      signal: controller.signal,
    });
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : null;
    let errorText: string | undefined;
    if (res.status < 200 || res.status >= 300) {
      const rawErr = await res.text().catch(() => "");
      const snippet = rawErr.trim().replace(/\s+/g, " ").slice(0, 220);
      errorText = snippet
        ? `Push service HTTP ${res.status}: ${snippet}`
        : `Push service HTTP ${res.status}`;
      console.error(
        `[WebPush] Delivery ${req.deliveryId} failed against ${targetOrigin}: ${errorText}`
      );
    }
    return {
      status: res.status,
      retryAfterSec:
        retryAfterSec && Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? retryAfterSec
          : null,
      errorText,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    console.error(
      `[WebPush] Delivery ${req.deliveryId} network failure (${targetOrigin}):`,
      msg
    );
    return { status: 0, errorText: msg };
  } finally {
    clearTimeout(timeout);
  }
}

export function setCustomPushTransport(transport: PushTransport | null) {
  globalForPush.customPushTransport = transport;
}

export function isPushDispatcherPaused(): boolean {
  if (process.env.PUSH_DISPATCH_PAUSED === "true") return true;
  return Boolean(globalForPush.pushDispatcherPaused);
}

export function setPushDispatcherPaused(paused: boolean) {
  globalForPush.pushDispatcherPaused = paused;
}

/**
 * Marks any PENDING or PROCESSING deliveries whose expiresAt has passed as EXPIRED.
 */
export async function expireStalePendingDeliveries(now = new Date()): Promise<number> {
  const res = await prisma.pushDelivery.updateMany({
    where: {
      status: { in: ["PENDING", "PROCESSING"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
      claimedUntil: null,
      lastError: "TTL expired before delivery",
    },
  });
  return res.count;
}

/**
 * Claims and dispatches pending Web Push deliveries with lease locking, exponential backoff,
 * Retry-After support, 404/410 subscription expiration, and recipient/role revalidation.
 */
export async function dispatchPendingPushDeliveries(options?: {
  limit?: number;
  now?: Date;
  transport?: PushTransport;
  claimLeaseMs?: number;
  recipientUserId?: string;
}): Promise<{
  paused: boolean;
  claimed: number;
  delivered: number;
  retried: number;
  expiredSubscriptions: number;
  skipped: number;
  expiredDeliveries: number;
  failedPermanent: number;
}> {
  const stats = {
    paused: false,
    claimed: 0,
    delivered: 0,
    retried: 0,
    expiredSubscriptions: 0,
    skipped: 0,
    expiredDeliveries: 0,
    failedPermanent: 0,
  };

  if (isPushDispatcherPaused()) {
    stats.paused = true;
    return stats;
  }

  const now = options?.now ?? new Date();
  const limit = options?.limit ?? 20;
  const claimLeaseMs = options?.claimLeaseMs ?? 30_000;
  const transport =
    options?.transport ??
    globalForPush.customPushTransport ??
    defaultHttpPushTransport;

  stats.expiredDeliveries += await expireStalePendingDeliveries(now);

  // Find candidate pending or crashed/stale-leased jobs
  const candidates = await prisma.pushDelivery.findMany({
    where: {
      ...(options?.recipientUserId ? { recipientUserId: options.recipientUserId } : {}),
      OR: [
        {
          status: "PENDING",
          nextAttemptAt: { lte: now },
        },
        {
          status: "PROCESSING",
          claimedUntil: { lte: now },
        },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  const vapidKeys = getVapidKeys();

  for (const candidate of candidates) {
    const leaseUntil = new Date(now.getTime() + claimLeaseMs);

    // Atomically claim the job
    const claimRes = await prisma.pushDelivery.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        ...(candidate.status === "PROCESSING"
          ? { claimedUntil: { lte: now } }
          : { nextAttemptAt: { lte: now } }),
      },
      data: {
        status: "PROCESSING",
        claimedUntil: leaseUntil,
      },
    });

    if (claimRes.count === 0) continue;
    stats.claimed++;

    if (candidate.expiresAt.getTime() <= now.getTime()) {
      await prisma.pushDelivery.update({
        where: { id: candidate.id },
        data: {
          status: "EXPIRED",
          claimedUntil: null,
          lastError: "Expired before send",
        },
      });
      stats.expiredDeliveries++;
      continue;
    }

    // Revalidate recipient user, role, and active subscription ownership
    const [recipient, subscription] = await Promise.all([
      prisma.user.findUnique({ where: { id: candidate.recipientUserId } }),
      prisma.pushSubscription.findUnique({
        where: { id: candidate.subscriptionId },
      }),
    ]);

    const isStaffEvent =
      candidate.eventType === "APPOINTMENT_CREATED" ||
      candidate.eventType === "CUSTOMER_CANCELLED";

    const roleStillValid =
      Boolean(recipient) &&
      (!isStaffEvent ||
        ((recipient!.role === "PROVIDER" || recipient!.role === "ADMIN") &&
          !recipient!.pendingStaffUpgrade));

    const subscriptionStillValid =
      Boolean(subscription) &&
      subscription!.status === "ACTIVE" &&
      subscription!.userId === candidate.recipientUserId;

    if (!roleStillValid || !subscriptionStillValid) {
      await prisma.pushDelivery.update({
        where: { id: candidate.id },
        data: {
          status: "SKIPPED",
          claimedUntil: null,
          lastError: !roleStillValid
            ? "Recipient role no longer eligible"
            : "Subscription inactive or rebound",
        },
      });
      stats.skipped++;
      continue;
    }

    const cleartextPayload = {
      title: candidate.title,
      body: candidate.body,
      tag: candidate.tag,
      url: candidate.targetPath,
      eventKey: candidate.eventKey,
      eventType: candidate.eventType,
      timestamp: now.getTime(),
    };

    const ttlSec = Math.max(
      60,
      Math.floor((candidate.expiresAt.getTime() - now.getTime()) / 1000)
    );

    let encryptedBody: Buffer;
    let authHeader: string;
    try {
      encryptedBody = encryptWebPushPayload(
        JSON.stringify(cleartextPayload),
        subscription!.p256dh,
        subscription!.auth
      );
      authHeader = createVapidAuthHeader(subscription!.endpoint, vapidKeys);
    } catch {
      await prisma.pushDelivery.update({
        where: { id: candidate.id },
        data: {
          status: "FAILED_PERMANENT",
          claimedUntil: null,
          lastError: "Invalid cryptographic key material on subscription",
        },
      });
      await prisma.pushSubscription.update({
        where: { id: subscription!.id },
        data: { status: "EXPIRED", lastErrorCode: "CRYPTO_INVALID" },
      });
      stats.failedPermanent++;
      continue;
    }

    const res = await transport({
      deliveryId: candidate.id,
      endpoint: subscription!.endpoint,
      headers: {
        Authorization: authHeader,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSec),
        Urgency: "high",
      },
      body: encryptedBody,
      cleartextPayload,
    });

    const nextAttempts = candidate.attempts + 1;

    if (res.status >= 200 && res.status < 300) {
      await prisma.$transaction([
        prisma.pushDelivery.update({
          where: { id: candidate.id },
          data: {
            status: "DELIVERED",
            attempts: nextAttempts,
            deliveredAt: now,
            claimedUntil: null,
            lastStatusCode: res.status,
            lastError: null,
          },
        }),
        prisma.pushSubscription.update({
          where: { id: subscription!.id },
          data: {
            lastSuccessAt: now,
            lastErrorCode: null,
          },
        }),
      ]);
      stats.delivered++;
    } else if (res.status === 404 || res.status === 410) {
      // Push subscription expired or unsubscribed at browser push service
      await prisma.$transaction([
        prisma.pushDelivery.update({
          where: { id: candidate.id },
          data: {
            status: "FAILED_PERMANENT",
            attempts: nextAttempts,
            claimedUntil: null,
            lastStatusCode: res.status,
            lastError: "Push subscription expired or unsubscribed (404/410)",
          },
        }),
        prisma.pushSubscription.update({
          where: { id: subscription!.id },
          data: {
            status: "EXPIRED",
            lastErrorCode: String(res.status),
          },
        }),
      ]);
      stats.expiredSubscriptions++;
      stats.failedPermanent++;
    } else {
      const isExhausted =
        nextAttempts >= candidate.maxAttempts ||
        res.status === 400 ||
        res.status === 413;
      const backoffSec =
        res.retryAfterSec && res.retryAfterSec > 0
          ? Math.min(3600, res.retryAfterSec)
          : Math.min(3600, Math.pow(2, nextAttempts) * 5);
      const nextAttemptAt = new Date(now.getTime() + backoffSec * 1000);

      await prisma.$transaction([
        prisma.pushDelivery.update({
          where: { id: candidate.id },
          data: {
            status: isExhausted ? "FAILED_PERMANENT" : "PENDING",
            attempts: nextAttempts,
            nextAttemptAt,
            claimedUntil: null,
            lastStatusCode: res.status || null,
            lastError:
              res.errorText || `Push service HTTP ${res.status || "ERR"}`,
          },
        }),
        prisma.pushSubscription.update({
          where: { id: subscription!.id },
          data: {
            lastErrorCode: String(res.status || "NETWORK_ERROR"),
          },
        }),
      ]);

      if (isExhausted) {
        stats.failedPermanent++;
      } else {
        stats.retried++;
      }
    }
  }

  return stats;
}

/**
 * Operational metrics summary for monitoring and incident response.
 */
export async function getPushDispatcherMetrics() {
  const [
    pendingCount,
    processingCount,
    deliveredCount,
    failedPermanentCount,
    expiredCount,
    skippedCount,
    activeSubscriptions,
    expiredSubscriptions,
    oldestPending,
  ] = await Promise.all([
    prisma.pushDelivery.count({ where: { status: "PENDING" } }),
    prisma.pushDelivery.count({ where: { status: "PROCESSING" } }),
    prisma.pushDelivery.count({ where: { status: "DELIVERED" } }),
    prisma.pushDelivery.count({ where: { status: "FAILED_PERMANENT" } }),
    prisma.pushDelivery.count({ where: { status: "EXPIRED" } }),
    prisma.pushDelivery.count({ where: { status: "SKIPPED" } }),
    prisma.pushSubscription.count({ where: { status: "ACTIVE" } }),
    prisma.pushSubscription.count({ where: { status: "EXPIRED" } }),
    prisma.pushDelivery.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  return {
    paused: isPushDispatcherPaused(),
    deliveries: {
      pending: pendingCount,
      processing: processingCount,
      delivered: deliveredCount,
      failedPermanent: failedPermanentCount,
      expired: expiredCount,
      skipped: skippedCount,
    },
    subscriptions: {
      active: activeSubscriptions,
      expired: expiredSubscriptions,
    },
    oldestPendingAgeSec: oldestPending
      ? Math.max(0, Math.floor((Date.now() - oldestPending.createdAt.getTime()) / 1000))
      : 0,
  };
}
