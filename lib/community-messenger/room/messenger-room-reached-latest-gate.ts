import type { MessengerChatViewPosition } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { isMessengerRoomEntryScrollSettled } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import { resolveJumpToLatestFabState } from "@/lib/community-messenger/room/messenger-room-first-unread";

/**
 * PR-1 검토 #2 (F2) — 진입 완료 전에는 「↓」·「reached latest」 정리를 하지 않는다.
 *
 * - 방이 열리면 읽기 위치를 지우고(`useMessengerRoomReaderScrollRoomLifecycle`) 진입 완료 viewport 동기화가 다시 쓴다.
 *   위치가 아직 없으면(null) 「↓」를 그리지 않는다 — 위치 미확정 때문에 FAB 가 잠깐 뜨는 깜빡임 방지.
 * - 「reached latest」(진입 미읽음 세션·구분선 정리)는 **효과 실행 시점의 store 위치**가 맨 아래이고
 *   진입 스크롤이 완료됐을 때만 — 렌더 때 읽은 지난 방문 값으로 지우지 않는다.
 */
export function resolveMessengerRoomJumpLatestFab(input: {
  scrollPosition: MessengerChatViewPosition | null;
  remainingUnreadCount: number;
}): { visible: boolean; badgeCount: number } {
  if (input.scrollPosition == null) return { visible: false, badgeCount: 0 };
  const atLatest = input.scrollPosition === "at-bottom" || input.scrollPosition === "near-bottom";
  return resolveJumpToLatestFabState({ atLatest, remainingUnreadCount: input.remainingUnreadCount });
}

export function shouldClearMessengerRoomEntryUnreadOnReachedLatest(input: {
  /** 읽기 위치 키(Timeline 스트림 id) */
  roomId: string;
  /** 진입 스크롤 소유자 키 — 라우트 id 와 스트림 id 가 다를 수 있어 둘 다 받는다 */
  entryOwnerRoomIds: ReadonlyArray<string | null | undefined>;
  remainingUnreadCount: number;
}): boolean {
  const rid = input.roomId.trim();
  if (!rid || input.remainingUnreadCount > 0) return false;
  const settled = input.entryOwnerRoomIds.some((id) => {
    const t = typeof id === "string" ? id.trim() : "";
    return t ? isMessengerRoomEntryScrollSettled(t) : false;
  });
  if (!settled) return false;
  const pos = useMessengerRoomReaderStateStore.getState().byRoom[rid]?.scrollPosition ?? null;
  return pos === "at-bottom" || pos === "near-bottom";
}
