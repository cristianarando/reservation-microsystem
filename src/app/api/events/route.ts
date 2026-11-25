// src/app/api/events/route.ts
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getClientIp } from "@/lib/rate-limit";
import {
  filterRealtimeEventForSubscriber,
  RealtimeEventPayload,
  RealtimeSubscriberContext,
  subscribeRealtimeEvents,
} from "@/lib/realtime-events";

export const dynamic = "force-dynamic";

const MAX_TOTAL_SSE_CONNECTIONS = 80;
const MAX_SSE_PER_IP = 10;

const globalForSseLimit = globalThis as unknown as {
  sseTotalActive?: number;
  ssePerIp?: Map<string, number>;
};

function getSseIpMap() {
  if (!globalForSseLimit.ssePerIp) {
    globalForSseLimit.ssePerIp = new Map<string, number>();
  }
  return globalForSseLimit.ssePerIp;
}

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const ipMap = getSseIpMap();
  const currentTotal = globalForSseLimit.sseTotalActive ?? 0;
  const currentIpCount = ipMap.get(ip) ?? 0;

  if (currentTotal >= MAX_TOTAL_SSE_CONNECTIONS || currentIpCount >= MAX_SSE_PER_IP) {
    return new Response("Too many concurrent event streams.", { status: 429 });
  }

  const user = await getCurrentUser();
  let ownStaffId: string | null = null;

  if (user && (user.role === "PROVIDER" || user.role === "ADMIN")) {
    const staffProfile = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    ownStaffId = staffProfile?.id ?? null;
  }

  const initialSessionVersion = user?.sessionVersion ?? 1;
  const subscriberContext: RealtimeSubscriberContext = {
    userId: user?.id ?? null,
    role: user?.role ?? null,
    ownStaffId,
    notifyAllStaff: Boolean(user?.notifyAllStaff),
  };

  globalForSseLimit.sseTotalActive = currentTotal + 1;
  ipMap.set(ip, currentIpCount + 1);

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let cleanedUp = false;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
          if (cleanup) cleanup();
        }
      };

      const sendEvent = (payload: RealtimeEventPayload) => {
        const filtered = filterRealtimeEventForSubscriber(payload, subscriberContext);
        if (!filtered) return;
        safeEnqueue(`data: ${JSON.stringify(filtered)}\n\n`);
      };

      sendEvent({ type: "CONNECTED", timestamp: Date.now() });

      const unsubscribe = subscribeRealtimeEvents(sendEvent);
      const keepalive = setInterval(async () => {
        // Periodically verify session validity & refresh live preferences (notifyAllStaff / role)
        if (subscriberContext.userId) {
          try {
            const fresh = await prisma.user.findUnique({
              where: { id: subscriberContext.userId },
              select: {
                role: true,
                isBlocked: true,
                sessionVersion: true,
                notifyAllStaff: true,
                staffProfile: { select: { id: true } },
              },
            });
            if (
              !fresh ||
              fresh.isBlocked ||
              (fresh.sessionVersion ?? 1) !== initialSessionVersion ||
              fresh.role !== subscriberContext.role
            ) {
              if (cleanup) cleanup();
              return;
            }
            subscriberContext.notifyAllStaff = Boolean(fresh.notifyAllStaff);
            subscriberContext.ownStaffId = fresh.staffProfile?.id ?? null;
          } catch {
            // Keep connection alive on transient read hiccup
          }
        }
        safeEnqueue(": keepalive\n\n");
      }, 20000);

      cleanup = () => {
        closed = true;
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(keepalive);
        unsubscribe();

        globalForSseLimit.sseTotalActive = Math.max(
          0,
          (globalForSseLimit.sseTotalActive ?? 1) - 1
        );
        const remainingForIp = (ipMap.get(ip) ?? 1) - 1;
        if (remainingForIp <= 0) {
          ipMap.delete(ip);
        } else {
          ipMap.set(ip, remainingForIp);
        }

        try {
          controller.close();
        } catch {
          // Stream already closed by client abort
        }
      };

      if (req.signal.aborted) {
        cleanup();
      } else {
        req.signal.addEventListener(
          "abort",
          () => {
            if (cleanup) cleanup();
          },
          { once: true }
        );
      }
    },
    cancel() {
      if (cleanup) cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
