import { buildCanonicalNotificationRoomHref } from "@/lib/chat-domain/push/canonical-notification-room-route";
import type { NotificationDeepLinkResolverKey } from "@/lib/notifications/core/notification-event-registry";
import { buildMissedCallWebPath } from "@/lib/notifications/policy/notification-deeplink-paths";
import { resolveSafeNotificationInternalRoute } from "@/lib/notifications/policy/notification-internal-route";
import {
  buildNotificationDetailHref,
  defaultInboxFallbackHref,
  isBareNotificationsCenterHref,
  isNotificationOriginUnavailableFallback,
  type InboxHrefRow,
  resolveNotificationInboxHref as resolveInboxHrefImpl,
} from "@/lib/notifications/resolve-notification-inbox-href";
import { tryResolveDeliveryAdOpsOwnerDestinationFromMeta } from "@/lib/stores/advertising/delivery-ad-operations-notification-map";

export type NotificationDestinationKind = "canonical" | "notification_detail" | "inbox_fallback";

export type NotificationDestination = {
  href: string;
  fallbackHref: string;
  destinationType: string;
  isExternal: boolean;
  kind: NotificationDestinationKind;
  fallbackReason?: string;
};

export type ResolveNotificationDestinationInput = {
  resolverKey?: NotificationDeepLinkResolverKey | null;
  notificationId?: string | null;
  roomId?: string | null;
  callSessionId?: string | null;
  displayRoute?: string | null;
  inboxRow?: InboxHrefRow | null;
  fallbackHref?: string | null;
};

function isBareNotificationsCenterPath(href: string): boolean {
  const pathOnly = href.split("?")[0] ?? href;
  if (pathOnly !== "/notifications") return false;
  if (href.includes("/notifications/")) return false;
  const q = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  return q === "" || q === "?";
}

function classifyHrefKind(href: string, fallbackHref: string): Pick<NotificationDestination, "kind" | "fallbackReason"> {
  if (isNotificationOriginUnavailableFallback(href) || href === fallbackHref) {
    return { kind: "inbox_fallback", fallbackReason: "origin_unavailable" };
  }
  if (/^\/notifications\/[^/?#]+/.test(href)) {
    return { kind: "notification_detail" };
  }
  return { kind: "canonical" };
}

function resolveByRegistryKey(
  resolverKey: NotificationDeepLinkResolverKey,
  context: {
    notificationId?: string | null;
    roomId?: string | null;
    callSessionId?: string | null;
    displayRoute?: string | null;
  },
  fallbackHref: string
): NotificationDestination {
  const displayRoute = resolveSafeNotificationInternalRoute(context.displayRoute, null);
  if (displayRoute && resolverKey !== "call_authority") {
    if (isBareNotificationsCenterPath(displayRoute)) {
      const detailHref =
        resolverKey === "notification_inbox"
          ? buildNotificationDetailHref(context.notificationId)
          : null;
      if (detailHref) {
        return {
          href: detailHref,
          fallbackHref,
          destinationType: "notification_inbox",
          isExternal: false,
          kind: "notification_detail",
        };
      }
      return {
        href: fallbackHref,
        fallbackHref,
        destinationType: "origin_unavailable",
        isExternal: false,
        kind: "inbox_fallback",
        fallbackReason: "bare_notifications_center",
      };
    }
    return {
      href: displayRoute,
      fallbackHref,
      destinationType: "display_route",
      isExternal: false,
      kind: "canonical",
    };
  }

  const roomId = String(context.roomId ?? "").trim();
  let href = fallbackHref;
  let destinationType: string = resolverKey;

  switch (resolverKey) {
    case "chat_room":
    case "trade_room":
    case "store_order_room":
    case "group_room": {
      // Product GROUP SSOT = community_messenger_rooms — never legacy /group-chat.
      const domainHint =
        resolverKey === "group_room"
          ? "group"
          : resolverKey === "trade_room"
            ? "trade"
            : resolverKey === "store_order_room"
              ? "store_order"
              : "general_direct";
      href = roomId
        ? buildCanonicalNotificationRoomHref({ roomId, chatDomain: domainHint }) ??
          "/community-messenger"
        : "/community-messenger";
      break;
    }
    case "missed_call": {
      const callSessionId = String(context.callSessionId ?? "").trim();
      href = roomId
        ? buildMissedCallWebPath(roomId, callSessionId || undefined)
        : "/community-messenger";
      break;
    }
    case "display_route":
      href = fallbackHref;
      destinationType = "origin_unavailable";
      break;
    case "notification_inbox":
      href = buildNotificationDetailHref(context.notificationId) ?? fallbackHref;
      destinationType = href === fallbackHref ? "origin_unavailable" : "notification_inbox";
      break;
    case "call_authority":
      href = "/community-messenger";
      break;
    default:
      href = fallbackHref;
      destinationType = "origin_unavailable";
  }

  const safe = resolveSafeNotificationInternalRoute(href, fallbackHref) ?? fallbackHref;
  return {
    href: safe,
    fallbackHref,
    destinationType,
    isExternal: false,
    ...classifyHrefKind(safe, fallbackHref),
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
    const deliveryAdHeal = tryResolveDeliveryAdOpsOwnerDestinationFromMeta(
      input.inboxRow.meta
    );
    const href =
      resolveSafeNotificationInternalRoute(fromInbox, null) ??
      (isBareNotificationsCenterHref(input.inboxRow.link_url)
        ? null
        : resolveSafeNotificationInternalRoute(input.inboxRow.link_url, null)) ??
      resolveSafeNotificationInternalRoute(deliveryAdHeal, null) ??
      fallbackHref;
    const semantic = classifyHrefKind(href, fallbackHref);
    return {
      href,
      fallbackHref,
      destinationType: semantic.kind === "inbox_fallback" ? "origin_unavailable" : "inbox_row",
      isExternal: false,
      ...semantic,
    };
  }

  if (input.resolverKey) {
    return resolveByRegistryKey(
      input.resolverKey,
      {
        roomId: input.roomId,
        callSessionId: input.callSessionId,
        notificationId: input.notificationId,
        displayRoute: input.displayRoute,
      },
      fallbackHref
    );
  }

  const fromDisplay =
    resolveSafeNotificationInternalRoute(input.displayRoute, fallbackHref) ?? fallbackHref;
  if (isBareNotificationsCenterPath(fromDisplay)) {
    return {
      href: fallbackHref,
      fallbackHref,
      destinationType: "origin_unavailable",
      isExternal: false,
      kind: "inbox_fallback",
      fallbackReason: "bare_notifications_center",
    };
  }
  const semantic = classifyHrefKind(fromDisplay, fallbackHref);
  return {
    href: fromDisplay,
    fallbackHref,
    destinationType: semantic.kind === "inbox_fallback" ? "origin_unavailable" : "display_route",
    isExternal: false,
    ...semantic,
  };
}
