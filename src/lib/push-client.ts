// src/lib/push-client.ts

export type DevicePushState =
  | "insecure_context"
  | "unsupported"
  | "ios_needs_install"
  | "prompt"
  | "denied"
  | "subscribed"
  | "unsubscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return undefined;
  }
  return (
    (await navigator.serviceWorker.getRegistration("/sw.js")) ||
    (await navigator.serviceWorker.getRegistration("/")) ||
    undefined
  );
}

export function isIosRequiresHomeScreenInstall(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    Boolean((navigator as unknown as { standalone?: boolean }).standalone);

  return !isStandalone;
}

export function isWebPushSupportedInBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  return (
    Boolean(window.isSecureContext) &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getActivePushEndpoint(): Promise<string | null> {
  if (!isWebPushSupportedInBrowser()) return null;
  try {
    const reg = await getSwRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub ? sub.endpoint : null;
  } catch {
    return null;
  }
}

export async function detectDevicePushState(): Promise<DevicePushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) {
    return "insecure_context";
  }
  if (isIosRequiresHomeScreenInstall() && !("PushManager" in window)) {
    return "ios_needs_install";
  }
  if (!isWebPushSupportedInBrowser()) {
    return isIosRequiresHomeScreenInstall() ? "ios_needs_install" : "unsupported";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }
  try {
    const reg = await getSwRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") {
      const res = await fetch("/api/push/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      const data = await res.json().catch(() => null);
      if (data?.unboundPreviousOwner) {
        await closeDisplayedAccountNotifications();
        return "unsubscribed";
      }
      if (data?.boundToCurrentUser) {
        return "subscribed";
      }
      return "unsubscribed";
    }
  } catch {
    // Ignore errors during state check
  }
  return Notification.permission === "granted" ? "unsubscribed" : "prompt";
}

export async function subscribeDeviceToWebPush(): Promise<{
  ok: boolean;
  state: DevicePushState;
  error?: string;
}> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      ok: false,
      state: "insecure_context",
      error:
        "Chrome requiere HTTPS (o localhost) para activar notificaciones Web Push. Si accediste por IP con http://, abre el sitio desde tu dominio con https://.",
    };
  }

  if (isIosRequiresHomeScreenInstall() && !isWebPushSupportedInBrowser()) {
    return {
      ok: false,
      state: "ios_needs_install",
      error:
        "En iPhone/iPad, primero agrega esta web a tu Pantalla de Inicio (Compartir -> Agregar a inicio) para habilitar notificaciones.",
    };
  }

  if (!isWebPushSupportedInBrowser()) {
    return {
      ok: false,
      state: "unsupported",
      error:
        "Tu navegador actual (o modo incógnito) no admite notificaciones Web Push.",
    };
  }

  const swErr = (window as unknown as { __swRegistrationError?: string | null })
    .__swRegistrationError;
  if (swErr) {
    return {
      ok: false,
      state: "unsupported",
      error: `No se pudo activar el servicio de avisos en este navegador (${swErr}).`,
    };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        state: permission === "denied" ? "denied" : "prompt",
        error:
          permission === "denied"
            ? "El permiso de notificaciones está bloqueado en Chrome. Haz clic en el ícono de ajustes junto a la barra de direcciones -> Notificaciones -> Permitir."
            : "Permiso de notificaciones pospuesto.",
      };
    }

    let reg = await getSwRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js");
    } else {
      await reg.update().catch(() => {});
    }
    const readyReg = await navigator.serviceWorker.ready;

    const keyRes = await fetch("/api/push/vapid-public-key", {
      cache: "no-store",
    });
    const keyData = await keyRes.json().catch(() => null);
    if (!keyRes.ok || !keyData?.publicKey) {
      return {
        ok: false,
        state: "unsubscribed",
        error: "No se pudo obtener la clave pública de notificaciones del servidor.",
      };
    }

    const appServerKey = urlBase64ToUint8Array(keyData.publicKey);
    let sub = await readyReg.pushManager.getSubscription();

    // Always mint a fresh FCM/push token when the user explicitly clicks "Activar avisos"
    // so stale Android Chrome subscriptions never linger after re-enabling notifications.
    if (sub) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }

    sub = await readyReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey.buffer as ArrayBuffer,
    });

    const saveRes = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    const saveData = await saveRes.json().catch(() => ({}));
    if (!saveRes.ok) {
      return {
        ok: false,
        state: "unsubscribed",
        error:
          saveData.error ||
          "No se pudo vincular este dispositivo a tu sesión actual.",
      };
    }

    // Show an immediate OS confirmation notification so the user verifies Chrome alerts work
    try {
      await readyReg.showNotification("🔔 Avisos activados", {
        body: "Este dispositivo recibirá notificaciones ante cambios o nuevas citas.",
        icon: "/icon/192",
        badge: "/icon/192",
        tag: "reservas-push-optin-confirm",
      });
    } catch {
      // Ignore if OS suppresses test notification
    }

    return { ok: true, state: "subscribed" };
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.message
        : "Error inesperado al activar las notificaciones.";
    return {
      ok: false,
      state: "unsubscribed",
      error: `No se pudieron activar las notificaciones: ${msg}`,
    };
  }
}

export async function unsubscribeDeviceFromWebPush(): Promise<{
  ok: boolean;
  state: DevicePushState;
}> {
  try {
    const reg = await getSwRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint || null;
    if (endpoint) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    }
    if (sub) {
      await sub.unsubscribe().catch(() => false);
    }
    await closeDisplayedAccountNotifications();
  } catch {
    // Best-effort cleanup
  }
  return { ok: true, state: "unsubscribed" };
}

export async function sendTestWebPush(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const endpoint = await getActivePushEndpoint();
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error:
          data?.error ||
          "El servidor no pudo completar el envío Web Push de prueba.",
      };
    }
    if (data.notification?.title && data.notification?.body) {
      await showDeduplicatedSystemNotification({
        title: data.notification.title,
        body: data.notification.body,
        tag: data.notification.tag || `reservas-test-push-${Date.now()}`,
        url: data.notification.targetPath || "/",
      });
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Error de conexión al probar el envío de notificaciones.",
    };
  }
}

export async function closeDisplayedAccountNotifications(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const reg = await getSwRegistration();
    if (reg?.active) {
      reg.active.postMessage({ type: "CLOSE_ACCOUNT_NOTIFICATIONS" });
    }
    const notifs = await reg?.getNotifications();
    if (notifs) {
      for (const n of notifs) {
        n.close();
      }
    }
  } catch {
    // Ignore if SW not active
  }
}

/**
 * Shows a deduplicated system notification (sharing `tag` with Web Push so the OS never shows two alerts).
 * Displays whenever permission is granted (foreground or background) unless the same `tag` is already shown.
 */
export async function showDeduplicatedSystemNotification(params: {
  title: string;
  body: string;
  tag: string;
  url: string;
}): Promise<void> {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    if ("serviceWorker" in navigator) {
      const reg =
        (await getSwRegistration()) ||
        (await Promise.race([
          navigator.serviceWorker.ready.catch(() => undefined),
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), 1500)
          ),
        ]));
      if (reg) {
        const existing = await reg
          .getNotifications({ tag: params.tag })
          .catch(() => []);
        if (existing && existing.length > 0) {
          return;
        }
        await reg.showNotification(params.title, {
          body: params.body,
          icon: "/icon/192",
          badge: "/icon/192",
          tag: params.tag,
          data: { url: params.url, eventKey: params.tag },
        });
        return;
      }
    }
    new Notification(params.title, {
      body: params.body,
      icon: "/icon/192",
      tag: params.tag,
    });
  } catch {
    // Mobile browsers disallow `new Notification()` constructor directly; Service Worker handles it
  }
}
