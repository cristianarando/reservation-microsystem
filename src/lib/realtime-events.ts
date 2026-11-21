// src/lib/realtime-events.ts
import { EventEmitter } from "node:events";

export type RealtimeEventType =
  | "CONNECTED"
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_UPDATED"
  | "SCHEDULE_UPDATED";

export interface RealtimeEventPayload {
  type: RealtimeEventType;
  appointmentId?: string;
  staffId?: string;
  customerId?: string;
  actorUserId?: string;
  customerName?: string;
  serviceName?: string;
  staffName?: string;
  startAt?: string;
  previousStartAt?: string;
  reason?: string;
  status?: string;
  cancelledBy?: "STAFF" | "CUSTOMER";
  eventKey?: string;
  hasLinkedStaffUser?: boolean;
  isOwnAgenda?: boolean;
  suppressAlert?: boolean;
  timestamp?: number;
}

export interface RealtimeSubscriberContext {
  userId: string | null;
  role: string | null;
  ownStaffId: string | null;
  notifyAllStaff?: boolean;
}

/**
 * Enforces server-side data isolation for SSE subscribers before serializing any event to the wire.
 * - Unauthenticated visitors only receive a generic `{ type: "SCHEDULE_UPDATED", timestamp }` signal.
 * - Authenticated customers only receive details for their own appointments; other events become generic `SCHEDULE_UPDATED`.
 * - Providers only receive events belonging to their own `ownStaffId`; events for other providers return `null`.
 * - Admins receive full alerts for their own agenda (or all staff if `notifyAllStaff` is enabled) and generic `SCHEDULE_UPDATED` for other staff when `notifyAllStaff` is false.
 */
export function filterRealtimeEventForSubscriber(
  event: RealtimeEventPayload,
  sub: RealtimeSubscriberContext
): RealtimeEventPayload | null {
  const timestamp = event.timestamp ?? Date.now();

  if (event.type === "CONNECTED") {
    return { type: "CONNECTED", timestamp };
  }

  // 1. Unauthenticated visitor: emit only generic availability refresh signal (no PII or IDs)
  if (!sub.userId || !sub.role) {
    return {
      type: "SCHEDULE_UPDATED",
      timestamp,
    };
  }

  const isSelfAction = Boolean(event.actorUserId && event.actorUserId === sub.userId);

  // 2. Authenticated CUSTOMER
  if (sub.role === "CUSTOMER") {
    if (event.customerId && event.customerId === sub.userId) {
      return {
        type: event.type,
        appointmentId: event.appointmentId,
        staffId: event.staffId,
        serviceName: event.serviceName,
        staffName: event.staffName,
        startAt: event.startAt,
        previousStartAt: event.previousStartAt,
        reason: event.reason,
        status: event.status,
        cancelledBy: event.cancelledBy,
        eventKey: event.eventKey,
        suppressAlert: isSelfAction,
        timestamp,
      };
    }
    // Event is for another customer or general schedule: only send generic availability signal
    return {
      type: "SCHEDULE_UPDATED",
      timestamp,
    };
  }

  // 3. Authenticated PROVIDER (Doctor / Specialist)
  if (sub.role === "PROVIDER") {
    if (event.type === "SCHEDULE_UPDATED") {
      if (!event.staffId || (sub.ownStaffId && event.staffId === sub.ownStaffId)) {
        return {
          type: "SCHEDULE_UPDATED",
          staffId: sub.ownStaffId || undefined,
          timestamp,
        };
      }
      return null;
    }

    if (sub.ownStaffId && event.staffId === sub.ownStaffId) {
      return {
        type: event.type,
        appointmentId: event.appointmentId,
        staffId: event.staffId,
        customerName: event.customerName,
        serviceName: event.serviceName,
        staffName: event.staffName,
        startAt: event.startAt,
        previousStartAt: event.previousStartAt,
        reason: event.reason,
        status: event.status,
        cancelledBy: event.cancelledBy,
        eventKey: event.eventKey,
        isOwnAgenda: true,
        suppressAlert: isSelfAction,
        timestamp,
      };
    }

    // Do not deliver other doctors' appointment events to this provider
    return null;
  }

  // 4. Authenticated ADMIN
  if (sub.role === "ADMIN") {
    if (event.type === "SCHEDULE_UPDATED") {
      return {
        type: "SCHEDULE_UPDATED",
        staffId: event.staffId,
        timestamp,
      };
    }

    const isOwnAgenda = Boolean(sub.ownStaffId && event.staffId === sub.ownStaffId);
    const isPureAdminWithoutPersonalAgenda = !sub.ownStaffId;
    const isUnlinkedStaffEvent = event.hasLinkedStaffUser === false;
    if (
      isOwnAgenda ||
      sub.notifyAllStaff ||
      isPureAdminWithoutPersonalAgenda ||
      isUnlinkedStaffEvent
    ) {
      return {
        type: event.type,
        appointmentId: event.appointmentId,
        staffId: event.staffId,
        customerName: event.customerName,
        serviceName: event.serviceName,
        staffName: event.staffName,
        startAt: event.startAt,
        previousStartAt: event.previousStartAt,
        reason: event.reason,
        status: event.status,
        cancelledBy: event.cancelledBy,
        eventKey: event.eventKey,
        isOwnAgenda,
        suppressAlert: isSelfAction,
        timestamp,
      };
    }

    // Admin team view refreshes on other staff changes without delivering unrequested alerts
    return {
      type: "SCHEDULE_UPDATED",
      staffId: event.staffId,
      isOwnAgenda: false,
      suppressAlert: true,
      timestamp,
    };
  }

  return null;
}

const globalForRealtime = globalThis as unknown as {
  realtimeEmitter?: EventEmitter;
};

function getEmitter(): EventEmitter {
  if (!globalForRealtime.realtimeEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalForRealtime.realtimeEmitter = emitter;
  }
  return globalForRealtime.realtimeEmitter;
}

const CHANNEL = "reservas:realtime";

export function emitRealtimeEvent(payload: RealtimeEventPayload): void {
  const emitter = getEmitter();
  emitter.emit(CHANNEL, {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  });
}

export function subscribeRealtimeEvents(
  listener: (payload: RealtimeEventPayload) => void
): () => void {
  const emitter = getEmitter();
  emitter.on(CHANNEL, listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    emitter.off(CHANNEL, listener);
  };
}

export function getRealtimeSubscriberCount(): number {
  return getEmitter().listenerCount(CHANNEL);
}
