/**
 * 하단 메신저(chat) 탭 뱃지 — Rebuild Authority.
 *
 * Chat tab = general 1:1 + group unread **room** count (`communityMessengerUnread` /
 * `bottom_nav_chat` chat_room targets). DO NOT overlay notification_events message SUM.
 * Event chat/group SUM is App icon total only (`badge-count`), never Chat tab.
 */
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import {
  getOwnerHubBadgeSnapshot,
  subscribeOwnerHubBadge,
} from "@/lib/chats/owner-hub-badge-store";
import { resolveBottomNavMessengerTabBadgeForOwnerStore } from "@/lib/stores/owner-store-badge-display-policy";

export function resolveMessengerChatTabBadgeCount(
  hasOwnerStore: boolean,
  hub: OwnerHubBadgeBreakdown = getOwnerHubBadgeSnapshot()
): number {
  return resolveBottomNavMessengerTabBadgeForOwnerStore(hub, hasOwnerStore);
}

/** Chat tab follows hub room-count only — hub store updates after mark_read / target clear. */
export function subscribeMessengerChatTabBadge(onStoreChange: () => void): () => void {
  return subscribeOwnerHubBadge(onStoreChange);
}
