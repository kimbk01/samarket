/**
 * Resolve in-app route from FCM data payload — mirrors Android MainActivity / FcmPayloadResolver.
 *
 * Priority (P0):
 * 1. schemaVersion/eventClass envelope (valid → canonical; invalid → safe fallback, no legacy URL bypass)
 * 2. existing deeplinkResolverKey
 * 3. verified internal route/url
 * 4. type-based legacy resolvers
 * 5. safe fallback
 */
import { buildCommunityPostNotificationPath } from "@/lib/notifications/community-post-notification-destination";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";
import type { NotificationDeepLinkResolverKey } from "@/lib/notifications/core/notification-event-registry";
import {
  buildChatRoomWebPath,
  buildGroupChatWebPath,
} from "@/lib/notifications/policy/notification-deeplink-paths";
import {
  isPushEnvelopeV1Present,
  parsePushEnvelopeV1,
  resolveRouteFromPushEnvelopeV1,
  PUSH_SAFE_FALLBACK_ROUTE,
} from "@/lib/push/push-envelope-v1";

export type FcmRouteData = Record<string, string | undefined>;

export type PushRouteResolveMeta = {
  path: string;
  source:
    | "envelope"
    | "envelope_invalid_fallback"
    | "legacy_resolver_key"
    | "legacy_url"
    | "legacy_type"
    | "fallback";
  fallbackReason?: string;
  eventClass?: string | null;
};

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

function resolveLegacyTypeRoute(data: FcmRouteData): string | null {
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
    return buildChatRoomWebPath(roomId);
  }
  if (type === "trade_message" && roomId) {
    return buildChatRoomWebPath(roomId);
  }
  if (type === "group_message" && roomId) {
    return buildGroupChatWebPath(roomId);
  }

  const orderId = firstNonEmpty(data.orderId, data.order_id);
  if (type === "delivery_order") {
    if (roomId) {
      return `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
    }
    if (orderId) {
      return `/orders/store/${encodeURIComponent(orderId)}`;
    }
  }

  const postId = firstNonEmpty(data.postId, data.post_id);
  if (type === "community_comment" && postId) {
    return buildCommunityPostNotificationPath(postId);
  }

  if (roomId) return `/community-messenger/rooms/${encodeURIComponent(roomId)}`;
  if (callId) return `/community-messenger/calls/${encodeURIComponent(callId)}`;
  return null;
}

/**
 * Full decision with source metadata (tests + pending route).
 */
export function resolvePushRouteDecisionFromFcmData(data: FcmRouteData): PushRouteResolveMeta {
  if (isPushEnvelopeV1Present(data)) {
    const parsed = parsePushEnvelopeV1(data);
    if (parsed.present) {
      const resolved = resolveRouteFromPushEnvelopeV1(parsed);
      return {
        path: resolved.path,
        source: resolved.reason,
        fallbackReason: resolved.fallbackReason,
        eventClass: resolved.eventClass ?? (parsed.valid ? parsed.eventClass : null),
      };
    }
  }

  const resolverKey = firstNonEmpty(data.deeplinkResolverKey, data.deeplink_resolver_key);
  const resolverKeys: ReadonlySet<string> = new Set([
    "chat_room",
    "group_room",
    "trade_room",
    "store_order_room",
    "display_route",
    "missed_call",
    "notification_inbox",
    "call_authority",
  ]);
  const callId = firstNonEmpty(data.callId, data.sessionId, data.session_id);
  const roomId = firstNonEmpty(data.roomId, data.room_id);
  if (resolverKeys.has(resolverKey)) {
    const href = resolveNotificationDestination({
      resolverKey: resolverKey as NotificationDeepLinkResolverKey,
      roomId,
      callSessionId: callId,
      fallbackHref: PUSH_SAFE_FALLBACK_ROUTE,
    }).href;
    return { path: href, source: "legacy_resolver_key" };
  }

  const url = firstNonEmpty(
    data.routeUrl,
    data.route_url,
    data.url,
    data.link_url,
    data.link_url_absolute
  );
  if (url) {
    const safe = resolveSafeNotificationInternalRoute(url);
    if (safe) return { path: safe, source: "legacy_url" };
  }

  const legacyType = resolveLegacyTypeRoute(data);
  if (legacyType) return { path: legacyType, source: "legacy_type" };

  return {
    path: PUSH_SAFE_FALLBACK_ROUTE,
    source: "fallback",
    fallbackReason: "unresolved_payload",
  };
}

export function resolvePushRouteFromFcmData(data: FcmRouteData): string | null {
  return resolvePushRouteDecisionFromFcmData(data).path;
}

/**
 * Routes that require an authenticated viewer before navigation.
 * `/notifications` is member Inbox — login required (guest must not resume as another user).
 */
export function isAuthRequiredPushRoute(path: string): boolean {
  const p = path.trim();
  if (!p || p.startsWith("/auth")) return false;
  return (
    p.startsWith("/community-messenger") ||
    p.startsWith("/chats") ||
    p.startsWith("/orders") ||
    p.startsWith("/philife") ||
    p.startsWith("/mypage") ||
    p.startsWith("/my") ||
    p.startsWith("/notifications") ||
    p.startsWith("/stores/owner")
  );
}

export { PUSH_SAFE_FALLBACK_ROUTE };
