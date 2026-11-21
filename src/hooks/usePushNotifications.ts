"use client";

import { useCallback, useEffect, useState } from "react";
import {
  detectDevicePushState,
  DevicePushState,
  sendTestWebPush,
  subscribeDeviceToWebPush,
  unsubscribeDeviceFromWebPush,
} from "@/lib/push-client";

interface UsePushNotificationsOptions {
  userId?: string | null;
  isImpersonating?: boolean;
}

/**
 * Shared hook managing browser Web Push device state, subscription lifecycle,
 * account reconciliation across shared devices, and live server push testing.
 */
export function usePushNotifications({
  userId,
  isImpersonating = false,
}: UsePushNotificationsOptions) {
  const [pushState, setPushState] = useState<DevicePushState>("prompt");
  const [pushBusy, setPushBusy] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isImpersonating) return;
    let active = true;
    detectDevicePushState().then((st) => {
      if (active) setPushState(st);
    });
    return () => {
      active = false;
    };
  }, [userId, isImpersonating]);

  const effectivePushState: DevicePushState = isImpersonating
    ? "unsubscribed"
    : pushState;

  const togglePush = useCallback(async (): Promise<{
    action: "subscribed" | "unsubscribed";
    ok: boolean;
    state: DevicePushState;
    error?: string;
  }> => {
    setPushBusy(true);
    setPushMessage(null);
    try {
      if (effectivePushState === "subscribed") {
        const res = await unsubscribeDeviceFromWebPush();
        setPushState(res.state);
        return { action: "unsubscribed", ok: true, state: res.state };
      }
      const res = await subscribeDeviceToWebPush();
      setPushState(res.state);
      return {
        action: "subscribed",
        ok: res.ok,
        state: res.state,
        error: res.error,
      };
    } finally {
      setPushBusy(false);
    }
  }, [effectivePushState]);

  const testPush = useCallback(async () => {
    setTestingPush(true);
    setPushMessage(null);
    try {
      return await sendTestWebPush();
    } finally {
      setTestingPush(false);
    }
  }, []);

  return {
    pushState: effectivePushState,
    setPushState,
    pushBusy,
    testingPush,
    pushMessage,
    setPushMessage,
    togglePush,
    testPush,
  };
}
