"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";

/**
 * Shared client toast queue hook with auto-dismissal and stable ref for SSE callbacks.
 */
export function useToastQueue(defaultDurationMs = 4500) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback(
    (
      type: ToastItem["type"],
      title: string,
      message?: string,
      durationMs = defaultDurationMs
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [defaultDurationMs]
  );

  const removeToast = useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const latestShowToastRef = useRef(showToast);
  useEffect(() => {
    latestShowToastRef.current = showToast;
  }, [showToast]);

  return {
    toasts,
    showToast,
    removeToast,
    latestShowToastRef,
  };
}
