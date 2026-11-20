// src/app/api/events/route.ts
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  filterRealtimeEventForSubscriber,
  RealtimeEventPayload,
  RealtimeSubscriberContext,
  subscribeRealtimeEvents,
} from "@/lib/realtime-events";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  let ownStaffId: string | null = null;

  if (user && (user.role === "PROVIDER" || user.role === "ADMIN")) {
    const staffProfile = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    ownStaffId = staffProfile?.id ?? null;
  }

  const subscriberContext: RealtimeSubscriberContext = {
    userId: user?.id ?? null,
    role: user?.role ?? null,
    ownStaffId,
    notifyAllStaff: Boolean(user?.notifyAllStaff),
  };

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
      const keepalive = setInterval(() => {
        safeEnqueue(": keepalive\n\n");
      }, 20000);

      cleanup = () => {
        closed = true;
        if (cleanedUp) return;
        cleanedUp = true;
        clearInterval(keepalive);
        unsubscribe();
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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
