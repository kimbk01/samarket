import type { NotificationDeepLinkResolverKey } from "@/lib/notifications/core/notification-event-registry";
import { resolveNotificationDestination } from "@/lib/notifications/resolve-notification-destination";

export {
  buildChatRoomDeepLink,
  buildChatRoomWebPath,
  buildGroupChatWebPath,
  buildMissedCallWebPath,
  buildTradeLegacyChatWebPath,
} from "@/lib/notifications/policy/notification-deeplink-paths";

export type NotificationDeepLinkContext = Readonly<{
  roomId?: string | null;
  callSessionId?: string | null;
  displayRoute?: string | null;
}>;

/**
 * @deprecated Prefer `resolveNotificationDestination`. Thin facade for push/dispatch callers.
 */
export function resolveNotificationDeepLink(
  resolverKey: NotificationDeepLinkResolverKey,
  context: NotificationDeepLinkContext
): string {
  return resolveNotificationDestination({
    resolverKey,
    roomId: context.roomId,
    callSessionId: context.callSessionId,
    displayRoute: context.displayRoute,
    fallbackHref: "/notifications",
  }).href;
}
