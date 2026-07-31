import type { NotificationDeepLinkResolverKey } from "@/lib/notifications/core/notification-event-registry";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";

export function buildChatRoomDeepLink(roomId: string): string {
  return `dibay://chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildChatRoomWebPath(roomId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
}

export function buildMissedCallWebPath(roomId: string, callSessionId: string): string {
  return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}?focus=call-history&callId=${encodeURIComponent(callSessionId.trim())}`;
}

export function buildGroupChatWebPath(roomId: string): string {
  return `/group-chat/${encodeURIComponent(roomId.trim())}`;
}

export function buildTradeLegacyChatWebPath(roomId: string): string {
  return `/chats/${encodeURIComponent(roomId.trim())}`;
}

export type NotificationDeepLinkContext = Readonly<{
  roomId?: string | null;
  callSessionId?: string | null;
  displayRoute?: string | null;
}>;

export function resolveNotificationDeepLink(
  resolverKey: NotificationDeepLinkResolverKey,
  context: NotificationDeepLinkContext
): string {
  const displayRoute = resolveSafeNotificationInternalRoute(
    context.displayRoute
  );
  if (displayRoute && resolverKey !== "call_authority") return displayRoute;
  const roomId = String(context.roomId ?? "").trim();
  switch (resolverKey) {
    case "chat_room":
    case "trade_room":
    case "store_order_room":
      return roomId ? buildChatRoomWebPath(roomId) : "/community-messenger";
    case "group_room":
      return roomId ? buildGroupChatWebPath(roomId) : "/community-messenger";
    case "missed_call": {
      const callSessionId = String(context.callSessionId ?? "").trim();
      return roomId && callSessionId
        ? buildMissedCallWebPath(roomId, callSessionId)
        : "/community-messenger?surface=call-logs";
    }
    case "display_route":
      return "/notifications";
    case "call_authority":
      return "/community-messenger";
    default:
      return "/notifications";
  }
}
