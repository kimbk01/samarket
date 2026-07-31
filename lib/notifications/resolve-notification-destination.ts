import type { NotificationDeepLinkResolverKey } from "@/lib/notifications/core/notification-event-registry";
import {
  buildChatRoomWebPath,
  buildGroupChatWebPath,
  buildMissedCallWebPath,
} from "@/lib/notifications/policy/notification-deeplink-paths";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import {
  defaultInboxFallbackHref,
  type InboxHrefRow,
  resolveNotificationInboxHref as resolveInboxHrefImpl,
} from "@/lib/notifications/resolve-notification-inbox-href";

export type NotificationDestination = {
  href: string;
  fallbackHref: string;
  destinationType: string;
  isExternal: boolean;
};

export type ResolveNotificationDestinationInput = {
  resolverKey?: NotificationDeepLinkResolverKey | null;
  roomId?: string | null;
  callSessionId?: string | null;
  displayRoute?: string | null;
  inboxRow?: InboxHrefRow | null;
  fallbackHref?: string | null;
};

function resolveByRegistryKey(
  resolverKey: NotificationDeepLinkResolverKey,
  context: { roomId?: string | null; callSessionId?: string | null; displayRoute?: string | null },
  fallbackHref: string
): NotificationDestination {
  const displayRoute = resolveSafeNotificationInternalRoute(context.displayRoute, null);
  if (displayRoute && resolverKey !== "call_authority") {
    return {
      href: displayRoute,
      fallbackHref,
      destinationType: "display_route",
      isExternal: false,
    };
  }

  const roomId = String(context.roomId ?? "").trim();
  let href = fallbackHref;
  let destinationType: string = resolverKey;

  switch (resolverKey) {
    case "chat_room":
    case "trade_room":
    case "store_order_room":
      href = roomId ? buildChatRoomWebPath(roomId) : "/community-messenger";
      break;
    case "group_room":
      href = roomId ? buildGroupChatWebPath(roomId) : "/community-messenger";
      break;
    case "missed_call": {
      const callSessionId = String(context.callSessionId ?? "").trim();
      href =
        roomId && callSessionId
          ? buildMissedCallWebPath(roomId, callSessionId)
          : "/community-messenger?surface=call-logs";
      break;
    }
    case "display_route":
      href = "/notifications";
      break;
    case "notification_inbox":
      href = fallbackHref;
      destinationType = "notification_inbox";
      break;
    case "call_authority":
      href = "/community-messenger";
      break;
    default:
      href = "/notifications";
      destinationType = "fallback";
  }

  const safe = resolveSafeNotificationInternalRoute(href, fallbackHref) ?? fallbackHref;
  return {
    href: safe,
    fallbackHref,
    destinationType,
    isExternal: false,
  };
}

/**
 * Canonical notification destination resolver (Bell · push · SW · preview).
 */
export function resolveNotificationDestination(
  input: ResolveNotificationDestinationInput
): NotificationDestination {
  const fallbackHref = input.fallbackHref?.trim() || defaultInboxFallbackHref();

  if (input.inboxRow) {
    const fromInbox = resolveInboxHrefImpl(input.inboxRow);
    const href =
      resolveSafeNotificationInternalRoute(fromInbox, fallbackHref) ??
      resolveSafeNotificationInternalRoute(input.inboxRow.link_url, fallbackHref) ??
      fallbackHref;
    return {
      href,
      fallbackHref,
      destinationType: "inbox_row",
      isExternal: false,
    };
  }

  if (input.resolverKey) {
    return resolveByRegistryKey(
      input.resolverKey,
      {
        roomId: input.roomId,
        callSessionId: input.callSessionId,
        displayRoute: input.displayRoute,
      },
      fallbackHref
    );
  }

  const fromDisplay =
    resolveSafeNotificationInternalRoute(input.displayRoute, fallbackHref) ?? fallbackHref;
  return {
    href: fromDisplay,
    fallbackHref,
    destinationType: "display_route",
    isExternal: false,
  };
}
