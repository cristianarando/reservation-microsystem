"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AvailabilityUnavailableReason,
  PublicTimeOffNotice,
} from "@/lib/timeoff-utils";

interface UseAvailabilitySlotsOptions {
  step: number;
  serviceId?: string | null;
  staffId: string;
  dateStr: string;
  setSelectedTime: React.Dispatch<React.SetStateAction<string>>;
}

interface AvailabilityResponsePayload {
  slots?: string[];
  timeOffNotices?: PublicTimeOffNotice[];
  unavailableReason?: AvailabilityUnavailableReason | null;
}

export function useAvailabilitySlots({
  step,
  serviceId,
  staffId,
  dateStr,
  setSelectedTime,
}: UseAvailabilitySlotsOptions) {
  const availabilityQueryKey =
    (step === 3 || step === 4) && serviceId && dateStr
      ? `${serviceId}|${staffId}|${dateStr}`
      : null;

  const [availabilityState, setAvailabilityState] = useState<{
    key: string;
    slots: string[];
    timeOffNotices: PublicTimeOffNotice[];
    unavailableReason: AvailabilityUnavailableReason | null;
  } | null>(null);

  const activeKeyRef = useRef<string | null>(availabilityQueryKey);
  useEffect(() => {
    activeKeyRef.current = availabilityQueryKey;
  }, [availabilityQueryKey]);

  const applyAvailabilityPayload = useCallback(
    (key: string, data: AvailabilityResponsePayload) => {
      if (activeKeyRef.current !== key) return;
      const slots: string[] = data.slots || [];
      setAvailabilityState({
        key,
        slots,
        timeOffNotices: data.timeOffNotices || [],
        unavailableReason: data.unavailableReason || null,
      });
      setSelectedTime((prevTime) =>
        prevTime && slots.includes(prevTime) ? prevTime : ""
      );
    },
    [setSelectedTime]
  );

  const refreshSlots = useCallback(
    (signal?: AbortSignal) => {
      if (!serviceId || !dateStr || !availabilityQueryKey) return;
      const keySnapshot = availabilityQueryKey;
      fetch(
        `/api/availability?serviceId=${encodeURIComponent(serviceId)}&staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(dateStr)}&_t=${Date.now()}`,
        { cache: "no-store", signal }
      )
        .then(async (res) => {
          if (!res.ok) return { slots: [] };
          return res.json().catch(() => ({ slots: [] }));
        })
        .then((data) => {
          if (signal?.aborted || !data) return;
          applyAvailabilityPayload(keySnapshot, data);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Error fetching availability:", err);
        });
    },
    [serviceId, staffId, dateStr, availabilityQueryKey, applyAvailabilityPayload]
  );

  useEffect(() => {
    if (!availabilityQueryKey || (step !== 3 && step !== 4)) return;
    const controller = new AbortController();
    refreshSlots(controller.signal);
    return () => controller.abort();
  }, [step, availabilityQueryKey, refreshSlots]);

  useEffect(() => {
    if (step !== 3 || !availabilityQueryKey) return;
    const handleFocus = () => refreshSlots();
    window.addEventListener("focus", handleFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshSlots();
      }
    }, 15000);
    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [step, availabilityQueryKey, refreshSlots]);

  const availableSlots =
    availabilityQueryKey && availabilityState?.key === availabilityQueryKey
      ? availabilityState.slots
      : [];
  const timeOffNotices =
    availabilityQueryKey && availabilityState?.key === availabilityQueryKey
      ? availabilityState.timeOffNotices
      : [];
  const unavailableReason =
    availabilityQueryKey && availabilityState?.key === availabilityQueryKey
      ? availabilityState.unavailableReason
      : null;
  const slotsLoading = Boolean(
    availabilityQueryKey && availabilityState?.key !== availabilityQueryKey
  );

  const clearAvailabilityState = useCallback(() => {
    setAvailabilityState(null);
  }, []);

  return {
    availableSlots,
    timeOffNotices,
    unavailableReason,
    slotsLoading,
    refreshSlots,
    clearAvailabilityState,
  };
}
