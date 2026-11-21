"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastItem } from "@/components/ui/ToastContainer";

/**
 * Shared client toast queue hook with auto-dismissal and stable ref for SSE callbacks.
 */
export function useToastQueue(defaultDurationMs = 4500) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (
      type: ToastItem["type"],
      title: string,
      message?: string,
      durationMs = defaultDurationMs
    ) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    [defaultDurationMs]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
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
