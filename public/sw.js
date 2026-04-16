/* global self, clients */
/* SAMarket Web Push — VAPID 페이로드는 JSON { title, body, url, icon, tag, call_push_kind } */

self.addEventListener("message", function (event) {
  const d = event.data || {};
  if (d.type !== "close_messenger_call_notifications") return;
  const sessionId = typeof d.sessionId === "string" && d.sessionId.trim() ? d.sessionId.trim() : null;
  if (!sessionId) return;
  const tag = "samarket-incoming-call-" + sessionId;
  event.waitUntil(
    self.registration.getNotifications({ tag }).then(function (list) {
      for (let i = 0; i < list.length; i++) {
        list[i].close();
      }
    })
  );
});

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
  let tag = typeof payload.tag === "string" && payload.tag ? payload.tag : "kasama-push";

  const sessionId = typeof payload.sessionId === "string" && payload.sessionId ? payload.sessionId : null;
  const kind = typeof payload.kind === "string" ? payload.kind : null;
  const callPushKind =
    typeof payload.call_push_kind === "string" && payload.call_push_kind ? payload.call_push_kind : null;

  if (callPushKind === "call_canceled") {
    if (sessionId) {
      event.waitUntil(
        Promise.all([
          self.registration.getNotifications({ tag: "samarket-incoming-call-" + sessionId }).then(function (list) {
            for (let i = 0; i < list.length; i++) {
              list[i].close();
            }
          }),
          clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
            for (let i = 0; i < clientList.length; i++) {
              try {
                clientList[i].postMessage({ type: "samarket_messenger_call_canceled_wake", sessionId: sessionId });
              } catch {
                /* ignore */
              }
            }
          }),
        ])
      );
    }
    return;
  }

  if (
    payload.notification_type === "community_messenger_incoming_call" &&
    sessionId &&
    (!tag || tag.indexOf("samarket-incoming-call-") !== 0)
  ) {
    tag = "samarket-incoming-call-" + sessionId;
  }
  if (payload.notification_type === "community_messenger_message") {
    const roomId = typeof payload.roomId === "string" && payload.roomId ? payload.roomId : null;
    if (roomId && (!tag || tag === "kasama-push")) {
      tag = "samarket-message-room-" + roomId;
    }
  }

  const show = self.registration.showNotification(title, {
    body,
    icon,
    badge: icon,
    tag,
    data: { url, sessionId, kind, call_push_kind: callPushKind },
    renotify: true,
  });

  const wakeOpenTabs =
    payload.notification_type === "community_messenger_incoming_call" && sessionId
      ? clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
          for (let i = 0; i < clientList.length; i++) {
            try {
              clientList[i].postMessage({ type: "samarket_messenger_incoming_call_wake", sessionId: sessionId });
            } catch {
              /* ignore */
            }
          }
        })
      : payload.notification_type === "community_messenger_message"
        ? clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
            const roomId = typeof payload.roomId === "string" && payload.roomId ? payload.roomId : null;
            for (let i = 0; i < clientList.length; i++) {
              try {
                clientList[i].postMessage({ type: "samarket_messenger_message_wake", roomId: roomId });
              } catch {
                /* ignore */
              }
            }
          })
      : Promise.resolve();

  event.waitUntil(Promise.all([show, wakeOpenTabs]));
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
