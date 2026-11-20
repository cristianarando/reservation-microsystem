// Service Worker para soporte PWA instalable y notificaciones Web Push (Android / iOS 16.4+ / Chrome Desktop)
const CACHE_NAME = "reservas-pwa-v3";
const STATIC_PUBLIC_ASSETS = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon/192",
  "/icon/512",
];

function sanitizeRelativeUrl(rawUrl) {
  if (typeof rawUrl !== "string") return "/";
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return "/";
  }
  return trimmed;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_PUBLIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  // Never cache private API responses, SSE streams, auth endpoints, or admin routes
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin")
  ) {
    return;
  }

  const isStaticShellAsset =
    STATIC_PUBLIC_ASSETS.includes(url.pathname) ||
    url.pathname.startsWith("/_next/static/");

  if (!isStaticShellAsset) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  // Always use generic lock-screen safe title & body
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : "Actualización en tu agenda";
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : "Ingresa para revisar las novedades de tus citas.";
  const tag =
    typeof payload.tag === "string" && payload.tag.trim()
      ? payload.tag.trim()
      : typeof payload.eventKey === "string" && payload.eventKey.trim()
      ? payload.eventKey.trim()
      : "reservas-update";
  const targetUrl = sanitizeRelativeUrl(payload.url);

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/icon/192",
        badge: "/icon/192",
        tag,
        renotify: true,
        data: {
          url: targetUrl,
          eventKey: payload.eventKey || tag,
        },
      })
      .catch(() =>
        self.registration.showNotification(title, {
          body,
          tag,
          renotify: true,
          data: {
            url: targetUrl,
            eventKey: payload.eventKey || tag,
          },
        })
      )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetPath = sanitizeRelativeUrl(data.url);
  const fullTargetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            if (clientUrl.origin === self.location.origin) {
              client.postMessage({
                type: "PUSH_NOTIFICATION_CLICK",
                url: targetPath,
                eventKey: data.eventKey || null,
              });
              if ("navigate" in client) {
                await client.navigate(fullTargetUrl).catch(() => {});
              }
              if ("focus" in client) {
                return client.focus();
              }
            }
          } catch {
            // Ignore malformed client URL
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(fullTargetUrl);
        }
        return null;
      })
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "CLOSE_ACCOUNT_NOTIFICATIONS") {
    event.waitUntil(
      self.registration
        .getNotifications()
        .then((notifications) => {
          for (const notif of notifications) {
            notif.close();
          }
        })
        .catch(() => {})
    );
  }
});
