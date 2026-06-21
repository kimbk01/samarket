/**
 * Resolve in-app route from FCM data payload — mirrors Android MainActivity / FcmPayloadResolver.
 */

export type FcmRouteData = Record<string, string | undefined>;

function trim(value: string | undefined): string {
  return value?.trim() ?? "";
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const t = trim(value);
    if (t) return t;
  }
  return "";
}

export function resolveFcmPushTypeFromData(data: FcmRouteData): string {
  const type = trim(data.type);
  if (type) return type;
  const callPushKind = trim(data.call_push_kind);
  if (callPushKind === "incoming_call") return "incoming_call";
  if (callPushKind === "missed_call") return "missed_call";
  if (callPushKind === "call_canceled") return "call_canceled";
  if (data.dibay_call === "1") return "incoming_call";
  const notificationType = trim(data.notification_type);
  if (notificationType === "community_messenger_incoming_call") return "incoming_call";
  if (notificationType === "community_messenger_missed_call") return "missed_call";
  if (notificationType === "community_messenger_message") return "chat_message";
  return "unknown";
}

export function resolvePushRouteFromFcmData(data: FcmRouteData): string | null {
  const url = firstNonEmpty(data.routeUrl, data.route_url, data.url, data.link_url, data.link_url_absolute);
  if (url.startsWith("/")) return url;

  if (url) {
    try {
      const parsed = new URL(url);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return url;
    }
  }

  const type = resolveFcmPushTypeFromData(data);
  const callId = firstNonEmpty(data.callId, data.sessionId, data.session_id);
  const roomId = firstNonEmpty(data.roomId, data.room_id);

  if (type === "missed_call" && callId) {
    if (roomId) {
      return `/community-messenger/rooms/${encodeURIComponent(roomId)}?focus=call-history&callId=${encodeURIComponent(callId)}`;
    }
    return `/community-messenger/calls/logs?callId=${encodeURIComponent(callId)}`;
  }
  if (type === "incoming_call" && callId) {
    return `/community-messenger/calls/${encodeURIComponent(callId)}`;
  }

  if (type === "chat_message" && roomId) {
    return `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  }
  if (type === "trade_message" && roomId) {
    return `/chats/${encodeURIComponent(roomId)}`;
  }

  const orderId = firstNonEmpty(data.orderId, data.order_id);
  if (type === "delivery_order" && orderId) {
    return `/orders/store/${encodeURIComponent(orderId)}`;
  }

  const postId = firstNonEmpty(data.postId, data.post_id);
  if (type === "community_comment" && postId) {
    return `/philife/posts/${encodeURIComponent(postId)}`;
  }

  if (roomId) return `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  if (callId) return `/community-messenger/calls/${encodeURIComponent(callId)}`;
  return null;
}

export function isAuthRequiredPushRoute(path: string): boolean {
  const p = path.trim();
  if (!p || p.startsWith("/auth")) return false;
  return (
    p.startsWith("/community-messenger") ||
    p.startsWith("/chats") ||
    p.startsWith("/orders") ||
    p.startsWith("/philife") ||
    p.startsWith("/mypage")
  );
}
