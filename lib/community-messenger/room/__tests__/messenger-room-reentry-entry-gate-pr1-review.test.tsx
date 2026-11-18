// @vitest-environment jsdom
/**
 * PR-1 검토 #2·#5 (F2 보완)
 *  #2 재진입(rollout 기본 level 2): 지난 방문 at-bottom 이 남아도 진입 미읽음 세션·구분선·첫 안 읽음 이동이 유지된다.
 *     방이 열리면 읽기 위치를 지우고, 진입 완료 전에는 「↓」·「reached latest」 정리를 하지 않는다.
 *  #5 lastVisible 을 못 찾으면(null) 기존 값을 덮지 않는다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetMessengerRoomReaderStateStore,
  useMessengerRoomReaderStateStore,
} from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { useMessengerRoomReaderScrollRoomLifecycle } from "@/lib/community-messenger/room/use-messenger-room-reader-scroll-room-lifecycle";
import {
  resolveMessengerRoomJumpLatestFab,
  shouldClearMessengerRoomEntryUnreadOnReachedLatest,
} from "@/lib/community-messenger/room/messenger-room-reached-latest-gate";
import {
  markMessengerRoomEntryScrollSettled,
  resetMessengerRoomEntryScrollOwner,
} from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import {
  __resetMessengerRoomEntryUnreadStoreForTest,
  captureMessengerRoomEntryUnread,
  peekMessengerRoomEntryFirstUnreadId,
} from "@/lib/community-messenger/room/messenger-room-entry-unread-snapshot";
import {
  resolveFirstUnreadMessageId,
  resolveJumpToLatestFabAction,
} from "@/lib/community-messenger/room/messenger-room-first-unread";
import { syncMessengerRoomReaderStateFromViewport } from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { getMessengerNotificationRolloutLevel } from "@/lib/community-messenger/notifications/messenger-notification-rollout";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOM = "room-reentry";
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountLifecycle(roomId: string, streamRoomId?: string) {
  function Probe() {
    useMessengerRoomReaderScrollRoomLifecycle({ roomId, streamRoomId });
    return null;
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Probe />));
}

beforeEach(() => {
  resetMessengerRoomReaderStateStore();
  __resetMessengerRoomEntryUnreadStoreForTest();
  resetMessengerRoomEntryScrollOwner(ROOM);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("검토 #2 재진입 진입 게이트", () => {
  it("기본 rollout level 은 2(떠날 때 정리가 안 도는 조건) — 이 테스트의 전제", () => {
    expect(getMessengerNotificationRolloutLevel()).toBe(2);
  });

  it("방이 열리면 지난 방문 at-bottom·lastVisible 을 level 과 무관하게 지운다(라우트·스트림 id 모두)", () => {
    const st = useMessengerRoomReaderStateStore.getState();
    st.setScrollPosition(ROOM, "at-bottom");
    st.setLastVisibleMessageId(ROOM, "m9");
    st.setScrollPosition("stream-" + ROOM, "at-bottom");
    mountLifecycle(ROOM, "stream-" + ROOM);
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]).toBeUndefined();
    expect(useMessengerRoomReaderStateStore.getState().byRoom["stream-" + ROOM]).toBeUndefined();
  });

  it("같은 방 세션에서 이미 정리한 id 는 다시 지우지 않는다(진입 뒤 위치 보존)", () => {
    function Probe({ stream }: { stream: string }) {
      useMessengerRoomReaderScrollRoomLifecycle({ roomId: ROOM, streamRoomId: stream });
      return null;
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Probe stream={ROOM} />));
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "reading-history");
    act(() => root!.render(<Probe stream={"canonical-" + ROOM} />));
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.scrollPosition).toBe("reading-history");
  });

  it("미읽음 재진입: 지난 at-bottom 이 있어도 구분선·첫 안 읽음 이동 유지 → 진입 완료 뒤 실제 위치로만 판정", () => {
    const messages = [
      { id: "m1", isMine: false },
      { id: "m2", isMine: false },
      { id: "m3", isMine: false },
    ];
    // 지난 방문 흔적
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "at-bottom");
    useMessengerRoomReaderStateStore.getState().setLastVisibleMessageId(ROOM, "m3");
    mountLifecycle(ROOM);
    const firstUnread = resolveFirstUnreadMessageId({ messages, lastReadMessageId: "m1" });
    captureMessengerRoomEntryUnread({ roomId: ROOM, unreadCount: 2, firstUnreadMessageId: firstUnread });
    // 진입 완료 전: 위치 없음 → 「↓」 안 그림, reached latest 정리 안 함
    expect(resolveMessengerRoomJumpLatestFab({ scrollPosition: null, remainingUnreadCount: 2 }).visible).toBe(false);
    expect(
      shouldClearMessengerRoomEntryUnreadOnReachedLatest({ roomId: ROOM, entryOwnerRoomIds: [ROOM], remainingUnreadCount: 0 })
    ).toBe(false);
    // 진입 중 프로그램 스크롤로 잠깐 맨 아래가 기록돼도 진입 완료 전이면 정리 안 함
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "at-bottom");
    expect(
      shouldClearMessengerRoomEntryUnreadOnReachedLatest({ roomId: ROOM, entryOwnerRoomIds: [ROOM], remainingUnreadCount: 0 })
    ).toBe(false);
    expect(peekMessengerRoomEntryFirstUnreadId(ROOM)).toBe("m2");
    // 첫 안 읽음 이동 대상 유지
    expect(
      resolveJumpToLatestFabAction({ messages, lastReadMessageId: "m1", lastVisibleMessageId: null, remainingUnreadCount: 2 })
    ).toEqual({ kind: "first_unread", messageId: "m2" });
    // 진입 완료(첫 안 읽음 앵커 → 읽는 중) 뒤
    markMessengerRoomEntryScrollSettled(ROOM, "room_entry_restore");
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "reading-history");
    expect(
      shouldClearMessengerRoomEntryUnreadOnReachedLatest({ roomId: ROOM, entryOwnerRoomIds: [ROOM], remainingUnreadCount: 0 })
    ).toBe(false);
    expect(resolveMessengerRoomJumpLatestFab({ scrollPosition: "reading-history", remainingUnreadCount: 2 })).toEqual({
      visible: true,
      badgeCount: 2,
    });
    // 실제로 맨 아래 도달 + 남은 안 읽음 0 → 그때만 정리
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "at-bottom");
    expect(
      shouldClearMessengerRoomEntryUnreadOnReachedLatest({ roomId: ROOM, entryOwnerRoomIds: [ROOM], remainingUnreadCount: 0 })
    ).toBe(true);
  });

  it("진입 소유자 키가 라우트 id 여도(스트림 id 와 다름) 완료 판정", () => {
    markMessengerRoomEntryScrollSettled("route-x", "initial_load");
    useMessengerRoomReaderStateStore.getState().setScrollPosition("stream-x", "at-bottom");
    expect(
      shouldClearMessengerRoomEntryUnreadOnReachedLatest({
        roomId: "stream-x",
        entryOwnerRoomIds: ["route-x", "stream-x"],
        remainingUnreadCount: 0,
      })
    ).toBe(true);
    resetMessengerRoomEntryScrollOwner("route-x");
  });
});

describe("검토 #5 lastVisible null 덮어쓰기 금지", () => {
  it("행을 못 찾으면 기존 lastVisible 유지, 위치는 갱신", () => {
    useMessengerRoomReaderStateStore.getState().setLastVisibleMessageId(ROOM, "m5");
    const vp = document.createElement("div");
    Object.defineProperty(vp, "clientHeight", { value: 400 });
    Object.defineProperty(vp, "scrollHeight", { value: 2000 });
    Object.defineProperty(vp, "scrollTop", { value: 0, writable: true });
    vp.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 1, height: 400, width: 1, x: 0, y: 0, toJSON: () => ({}) });
    syncMessengerRoomReaderStateFromViewport({ viewport: vp, stickToBottomRef: { current: false }, roomId: ROOM, activeSheet: null });
    const st = useMessengerRoomReaderStateStore.getState().byRoom[ROOM];
    expect(st?.lastVisibleMessageId).toBe("m5");
    expect(st?.scrollPosition).toBe("reading-history");
  });
});
