/**
 * Bottom Chat (하단 「메신저」탭) unread room count.
 *
 * CONTRACT:
 * - Value = 일반+그룹+거래+주문(고객) unread **room** count (`projection.bottomChat`).
 * - DO NOT include Owner ops / owner order-chat rooms.
 * - Same value re-apply must not notify subscribers (no spurious re-render).
 * - Bottom Chat must subscribe here — not Owner hub aggregate.
 */

let communityMessengerUnread = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function getMessengerBottomChatUnreadCount(): number {
  return communityMessengerUnread;
}

export function getMessengerBottomChatUnreadServerSnapshot(): number {
  return 0;
}

export function subscribeMessengerBottomChatUnread(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Apply Bottom Chat unread. Returns whether subscribers were notified.
 * Identical value → no emit.
 */
export function applyMessengerBottomChatUnread(next: number): boolean {
  const n = Math.max(0, Math.floor(Number(next) || 0));
  if (n === communityMessengerUnread) return false;
  communityMessengerUnread = n;
  emit();
  return true;
}

/** @internal vitest */
export function __resetMessengerBottomChatUnreadForTest(): void {
  communityMessengerUnread = 0;
  listeners.clear();
}
