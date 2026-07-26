/**
 * 하단 메신저(chat) 탭 뱃지 — Rebuild Authority.
 *
 * Chat tab = general 1:1 + group unread **room** count (`communityMessengerUnread` /
 * `bottom_nav_chat` chat_room targets). DO NOT overlay notification_events message SUM.
 * Event chat/group SUM is App icon total only (`badge-count`), never Chat tab.
 *
 * CUTOVER: subscribe Messenger-only projection — not Owner hub aggregate.
 * Formula unchanged: Math.max(0, floor(communityMessengerUnread)).
 */
import {
  getMessengerBottomChatUnreadCount,
  subscribeMessengerBottomChatUnread,
} from "@/lib/notifications/messenger-bottom-chat-unread-projection";

/**
 * Bottom Chat badge count.
 * Optional `hub` keeps unit-test formula checks without touching the projection store.
 * Production callers omit `hub` and read Messenger projection only.
 */
export function resolveMessengerChatTabBadgeCount(
  _hasOwnerStore: boolean = false,
  input?: { communityMessengerUnread: number }
): number {
  const raw =
    input != null ? input.communityMessengerUnread : getMessengerBottomChatUnreadCount();
  return Math.max(0, Math.floor(Number(raw) || 0));
}

/** Chat tab follows Messenger projection room-count only. */
export function subscribeMessengerChatTabBadge(onStoreChange: () => void): () => void {
  return subscribeMessengerBottomChatUnread(onStoreChange);
}
