/* global self, clients */
/* SAMarket Web Push — VAPID 페이로드는 JSON { title, body, url, icon, tag } */

self.addEventListener("push", function (event) {
  let payload = { title: "SAMarket", body: "", url: "/", icon: "/icon", tag: "kasama-push" };
  try {
    if (event.data) {
      const j = event.data.json();
      payload = { ...payload, ...j };
    }
  } catch {
    /* ignore */
  }
  const title = typeof payload.title === "string" ? payload.title : "SAMarket";
  const body = typeof payload.body === "string" ? payload.body : "";
  const url = typeof payload.url === "string" && payload.url ? payload.url : "/";
  const icon = typeof payload.icon === "string" && payload.icon ? payload.icon : "/icon";
  const tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "kasama-push";

  const sessionId = typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : null;
  const kind = typeof payload.kind === "string" ? payload.kind : null;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge: icon,
      tag,
      data: { url, sessionId, kind },
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const raw =
    typeof data.url === "string" && data.url
      ? data.url
      : typeof data.sessionId === "string" && data.sessionId
        ? "/community-messenger/calls/" + encodeURIComponent(data.sessionId)
        : "/";
  let targetUrl;
  try {
    targetUrl = new URL(raw, self.location.origin).href;
  } catch {
    targetUrl = self.location.origin + "/";
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const c = clientList[i];
        if (c.url && "focus" in c) {
          if ("navigate" in c && typeof c.navigate === "function") {
            return c.navigate(targetUrl).then(function () {
              return c.focus();
            });
          }
          return c.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
