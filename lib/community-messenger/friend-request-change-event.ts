/**
 * 친구 요청 상태가 바뀜(새 요청 · 수락 · 거절 · 취소) — 앱 전체 친구 요청 실시간 피드(`useGlobalFriendRequestFeed`)가 보낸다.
 * 메신저 홈 밖에서 열려 있는 화면(연락처 전체 화면 등)이 요청 상태를 다시 맞출 때 쓴다 (실기 2026-11-11 결함 3:
 * 상대가 수락해도 연락처 화면에 「요청됨」이 남음).
 */
export const CM_FRIEND_REQUEST_CHANGED_EVENT = "cm:friend-request-changed";

export function notifyFriendRequestChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CM_FRIEND_REQUEST_CHANGED_EVENT));
}
