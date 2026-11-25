"use client";

import { useEffect, useRef } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";
import { showDeduplicatedSystemNotification } from "@/lib/push-client";
import {
  formatSpanishDateInTz,
  formatSpanishTimeInTz,
  resolveBusinessTimeZone,
} from "@/lib/timezone";

interface UseClientRealtimeSyncOptions {
  timezone?: string | null;
  onRefresh: () => void;
  onRefreshSlots: () => void;
  showToast: (type: ToastItem["type"], title: string, message?: string) => void;
}

export function useClientRealtimeSync({
  timezone,
  onRefresh,
  onRefreshSlots,
  showToast,
}: UseClientRealtimeSyncOptions) {
  const seenSseEventKeysRef = useRef<Set<string>>(new Set());
  const onRefreshRef = useRef(onRefresh);
  const onRefreshSlotsRef = useRef(onRefreshSlots);
  const showToastRef = useRef(showToast);
  const businessTzRef = useRef(resolveBusinessTimeZone(timezone));

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    onRefreshSlotsRef.current = onRefreshSlots;
  }, [onRefreshSlots]);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);
  useEffect(() => {
    businessTzRef.current = resolveBusinessTimeZone(timezone);
  }, [timezone]);

  useEffect(() => {
    const syncBootstrap = () => {
      if (document.visibilityState === "visible") {
        onRefreshRef.current();
      }
    };
    window.addEventListener("focus", syncBootstrap);
    document.addEventListener("visibilitychange", syncBootstrap);

    let es: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      es = new EventSource("/api/events");
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data);
          if (!ev?.type || ev.type === "CONNECTED") return;

          onRefreshRef.current();
          onRefreshSlotsRef.current();

          if (ev.suppressAlert) return;

          const dedupKey = ev.eventKey
            ? String(ev.eventKey)
            : `${ev.type}:${ev.appointmentId || ""}:${ev.timestamp || ""}`;
          if (seenSseEventKeysRef.current.has(dedupKey)) return;
          seenSseEventKeysRef.current.add(dedupKey);
          if (seenSseEventKeysRef.current.size > 100) {
            const firstKey = seenSseEventKeysRef.current.values().next().value;
            if (firstKey) seenSseEventKeysRef.current.delete(firstKey);
          }

          const tz = businessTzRef.current;
          const timeLabel = ev.startAt
            ? formatSpanishTimeInTz(new Date(ev.startAt), tz)
            : "";
          const dateLabel = ev.startAt
            ? formatSpanishDateInTz(new Date(ev.startAt), tz)
            : "";
          const oldTimeLabel = ev.previousStartAt
            ? formatSpanishTimeInTz(new Date(ev.previousStartAt), tz)
            : "";

          if (
            ev.type === "APPOINTMENT_CANCELLED" &&
            ev.cancelledBy === "STAFF"
          ) {
            const title = `⚠️ Cita cancelada: ${
              ev.serviceName || "Tu reserva"
            }${timeLabel ? ` (${timeLabel})` : ""}`;
            const body = `${
              ev.staffName || "El establecimiento"
            } canceló tu cita de ${ev.serviceName || "servicio"}${
              dateLabel ? ` del ${dateLabel}` : ""
            }${timeLabel ? ` a las ${timeLabel}` : ""}${
              ev.reason ? `. Motivo: "${ev.reason}"` : ""
            }. Revisa Mis Citas para elegir otro horario.`;
            showToastRef.current("warning", title, body);
            const targetUrl = ev.appointmentId
              ? `/?tab=my-appointments&appointmentId=${encodeURIComponent(ev.appointmentId)}`
              : "/?tab=my-appointments";
            void showDeduplicatedSystemNotification({
              title,
              body,
              tag: ev.appointmentId
                ? `apt-cancel-${ev.appointmentId}`
                : dedupKey,
              url: targetUrl,
            });
          } else if (
            ev.type === "APPOINTMENT_UPDATED" &&
            ev.status === "RESCHEDULED_BY_STAFF"
          ) {
            const title = `🕒 Nuevo horario: ${ev.serviceName || "Tu cita"}${
              timeLabel ? ` (${timeLabel})` : ""
            }`;
            const body = `${
              ev.staffName || "El profesional"
            } reprogramó tu cita de ${ev.serviceName || "servicio"}${
              oldTimeLabel ? ` (antes ${oldTimeLabel})` : ""
            }${dateLabel ? ` para el ${dateLabel}` : ""}${
              timeLabel ? ` a las ${timeLabel}` : ""
            }${
              ev.reason ? ` por "${ev.reason}"` : ""
            }. Confirma o reagenda en Mis Citas.`;
            showToastRef.current("info", title, body);
            const targetUrl = ev.appointmentId
              ? `/?tab=my-appointments&appointmentId=${encodeURIComponent(ev.appointmentId)}`
              : "/?tab=my-appointments";
            void showDeduplicatedSystemNotification({
              title,
              body,
              tag: ev.appointmentId
                ? `apt-move-${ev.appointmentId}`
                : dedupKey,
              url: targetUrl,
            });
          }
        } catch {
          // Ignore keepalive or malformed frames
        }
      };
    }

    // Fallback polling only when EventSource is absent or disconnected
    const poll = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (!es || es.readyState !== EventSource.OPEN)
      ) {
        onRefreshRef.current();
      }
    }, 10000);

    return () => {
      window.removeEventListener("focus", syncBootstrap);
      document.removeEventListener("visibilitychange", syncBootstrap);
      clearInterval(poll);
      if (es) es.close();
    };
  }, []);
}
