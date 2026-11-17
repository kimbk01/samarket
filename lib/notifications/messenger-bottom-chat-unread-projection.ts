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
/**
 * 앱 진입 실기 F3-a — 이번 실행(auth epoch)에서 진짜 값이 한 번이라도 들어왔는지.
 * 하단 채팅 탭은 이것이 false 인 동안만 지난 실행 숫자(표시 씨앗)를 보인다. 첫 적용은 값이 0 이어도 알린다.
 */
let communityMessengerUnreadApplied = false;
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

export function hasMessengerBottomChatUnreadApplied(): boolean {
  return communityMessengerUnreadApplied;
}

export function getMessengerBottomChatUnreadAppliedServerSnapshot(): boolean {
  return false;
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
  const firstApply = !communityMessengerUnreadApplied;
  communityMessengerUnreadApplied = true;
  if (n === communityMessengerUnread && !firstApply) return false;
  communityMessengerUnread = n;
  emit();
  return true;
}

/** @internal vitest */
export function __resetMessengerBottomChatUnreadForTest(): void {
  communityMessengerUnread = 0;
  communityMessengerUnreadApplied = false;
  listeners.clear();
}

/** B-07②: 로그아웃·계정 전환 auth epoch 초기화 — 이전 사용자 숫자 잔존 방지. */
export function resetMessengerBottomChatUnreadForAuthEpoch(): void {
  const changed = communityMessengerUnread !== 0 || communityMessengerUnreadApplied;
  communityMessengerUnread = 0;
  communityMessengerUnreadApplied = false;
  if (changed) emit();
}
