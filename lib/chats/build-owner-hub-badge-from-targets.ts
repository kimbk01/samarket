/**
 * Hub badge unread fields from notification_targets bundle (badge SSOT).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerHubBadgeUnreadPartial } from "@/lib/chats/build-owner-hub-badge-payload";
import {
  countNotificationTargetsHubBundle,
  type NotificationTargetHubBundle,
} from "@/lib/notifications/notification-targets";

export function ownerHubUnreadPartialFromTargetBundle(
  bundle: NotificationTargetHubBundle
): OwnerHubBadgeUnreadPartial {
  const chatTab = Math.max(0, bundle.bottom_nav_chat);
  const communityTab = Math.max(0, bundle.bottom_nav_community);
  return {
    chatUnread: 0,
    communityMessengerUnread: chatTab,
    philifeChatUnread: communityTab,
    socialChatUnread: chatTab + communityTab,
    storeOrderChatUnread: Math.max(0, bundle.fab_owner_order_chat),
  };
}

export async function fetchOwnerHubBadgeTargetBundle(
  sbAny: SupabaseClient<any>,
  userId: string,
  storeId?: string | null
): Promise<NotificationTargetHubBundle> {
  return countNotificationTargetsHubBundle(sbAny, userId, storeId);
}

export function hubBundleHasTargetData(bundle: NotificationTargetHubBundle): boolean {
  return (
    bundle.bottom_nav_chat > 0 ||
    bundle.bottom_nav_community > 0 ||
    bundle.bottom_nav_delivery > 0 ||
    bundle.fab_owner_orders > 0 ||
    bundle.fab_owner_store > 0 ||
    bundle.fab_owner_order_chat > 0 ||
    bundle.owner_commerce_inbox > 0
  );
}
