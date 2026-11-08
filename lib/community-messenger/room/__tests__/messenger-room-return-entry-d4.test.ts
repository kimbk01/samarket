import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appScrollKey,
  isAppScrollMemoryPath,
  isAppScrollVisitTrackedPath,
  markAppScrollNavIntent,
  noteAppScrollVisit,
  peekAppScrollVisit,
  resetAppScrollMemoryForTests,
  resolveAppScrollVisitForKey,
} from "@/lib/navigation/app-scroll-memory";
import { resolveMessengerRoomEntryScrollPlan } from "@/lib/community-messenger/room/messenger-room-entry-intent";
import {
  __resetMessengerRoomScrollPositionStoreForTest,
  clearMessengerRoomScrollPosition,
  MESSENGER_ROOM_RETURN_HISTORY_MAX_MESSAGES,
  MESSENGER_ROOM_RETURN_HISTORY_MAX_ROOMS,
  MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS,
  peekMessengerRoomReturnHistory,
  peekMessengerRoomScrollPosition,
  saveMessengerRoomReturnHistory,
  saveMessengerRoomScrollPosition,
} from "@/lib/community-messenger/room/messenger-room-scroll-position-store";
import {
  __resetMessengerRoomReturnEntryForTest,
  clearMessengerRoomReturnEntry,
  decideMessengerRoomReturnEntry,
  peekMessengerRoomReturnEntry,
} from "@/lib/community-messenger/room/messenger-room-return-entry";

const ROOM = "3e92fa77-de94-493b-b2e2-eb4813228d39";
const ROOM_PATH = `/community-messenger/rooms/${ROOM}`;
const LIST_KEY = appScrollKey("/community-messenger", "section=chats");
const ROOM_KEY = appScrollKey(ROOM_PATH, "");
const STORE_KEY = appScrollKey("/stores/abc", "");

function installBrowser(path: string, historyLength: number) {
  const map = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
  const loc = { pathname: path, search: "" };
  const hist = { length: historyLength };
  vi.stubGlobal("window", { location: loc, history: hist });
  return {
    go(p: string, len: number) {
      loc.pathname = p;
      hist.length = len;
    },
  };
}

describe("D4 메신저 방 「뒤로 돌아옴」 진입 (Owner 「D4 진행」 2026-11-09)", () => {
  beforeEach(() => {
    resetAppScrollMemoryForTests();
    __resetMessengerRoomScrollPositionStoreForTest();
    __resetMessengerRoomReturnEntryForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("방은 위치 저장 대상이 아니지만 방문 순서에는 들어간다", () => {
    expect(isAppScrollMemoryPath(ROOM_PATH)).toBe(false);
    expect(isAppScrollVisitTrackedPath(ROOM_PATH)).toBe(true);
    expect(isAppScrollVisitTrackedPath("/community-messenger")).toBe(false);
  });

  it("목록 → 방(new) → 링크 화면(new) → 뒤로 방(return) → 뒤로 목록(return)", () => {
    installBrowser("/community-messenger", 2);
    expect(noteAppScrollVisit(LIST_KEY, 2)).toBe("new");
    expect(noteAppScrollVisit(ROOM_KEY, 3)).toBe("new");
    expect(noteAppScrollVisit(STORE_KEY, 4)).toBe("new");
    // 기기 뒤로: 기록 길이 그대로
    expect(peekAppScrollVisit(ROOM_KEY, 4)).toBe("return");
    expect(noteAppScrollVisit(ROOM_KEY, 4)).toBe("return");
    expect(noteAppScrollVisit(LIST_KEY, 4)).toBe("return");
  });

  it("peek 는 기록·뒤로 신호를 바꾸지 않는다", () => {
    installBrowser("/community-messenger", 2);
    noteAppScrollVisit(LIST_KEY, 2);
    noteAppScrollVisit(ROOM_KEY, 3);
    noteAppScrollVisit(STORE_KEY, 4);
    markAppScrollNavIntent("back");
    expect(peekAppScrollVisit(ROOM_KEY, 5)).toBe("return");
    expect(peekAppScrollVisit(ROOM_KEY, 5)).toBe("return");
    // 신호가 남아 있어 실제 기록도 같은 판정
    expect(noteAppScrollVisit(ROOM_KEY, 5)).toBe("return");
  });

  it("resolve: 이미 기록한 방문이면 그 값(뒤에 다시 그려져도 return 으로 바뀌지 않음)", () => {
    installBrowser("/community-messenger", 2);
    noteAppScrollVisit(LIST_KEY, 2);
    expect(noteAppScrollVisit(ROOM_KEY, 3)).toBe("new");
    // 기록 직후 방이 늦게 그려져도(느린 첫 불러오기) 같은 방문 = new
    expect(resolveAppScrollVisitForKey(ROOM_KEY, 3)).toBe("new");
  });

  it("decide: 목록에서 누른 진입 = 돌아옴 아님 · 링크 화면에서 뒤로 = 돌아옴", () => {
    const b = installBrowser("/community-messenger", 2);
    noteAppScrollVisit(LIST_KEY, 2);
    b.go(ROOM_PATH, 3);
    expect(decideMessengerRoomReturnEntry(ROOM, 1_000_000)).toBe(false);
    noteAppScrollVisit(ROOM_KEY, 3);
    noteAppScrollVisit(STORE_KEY, 4);
    b.go(ROOM_PATH, 4);
    expect(decideMessengerRoomReturnEntry(ROOM, 1_010_000)).toBe(true);
    expect(peekMessengerRoomReturnEntry(ROOM, 1_010_500)).toBe(true);
    clearMessengerRoomReturnEntry(ROOM);
    expect(peekMessengerRoomReturnEntry(ROOM, 1_010_600)).toBe(false);
  });

  it("decide: 주소가 아직 이 방이 아니면(목록 누름 직후 렌더) 돌아옴 아님", () => {
    const b = installBrowser("/community-messenger", 2);
    noteAppScrollVisit(LIST_KEY, 2);
    noteAppScrollVisit(ROOM_KEY, 3);
    noteAppScrollVisit(STORE_KEY, 4);
    b.go("/stores/abc", 4);
    expect(decideMessengerRoomReturnEntry(ROOM)).toBe(false);
  });

  it("진입 정책: 돌아옴 → 보던 메시지·화면 안 위치 / 알림 진입은 최신 우선 / 안 읽은 메시지보다 돌아옴 우선", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: true,
        unreadCount: 3,
        firstUnreadMessageId: "m-unread",
        returnRestore: { anchorMessageId: "m-read", anchorOffsetPx: -42 },
      })
    ).toEqual({
      reason: "room_entry_restore",
      clearPersist: false,
      forceBottom: false,
      anchorMessageId: "m-read",
      anchorOffsetPx: -42,
    });
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "push",
        hasPersisted: true,
        returnRestore: { anchorMessageId: "m-read", anchorOffsetPx: 0 },
      })
    ).toMatchObject({ reason: "push_entry_initial_load", forceBottom: true });
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "default", hasPersisted: true, returnRestore: null })
    ).toMatchObject({ reason: "initial_load", forceBottom: true });
  });

  it("위치 보관: 30분 · 화면 안 위치 · 떼어진 화면 값(보던 메시지 없음)은 직전 위치를 덮지 않음", () => {
    expect(MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS).toBe(30 * 60_000);
    const t0 = Date.now();
    saveMessengerRoomScrollPosition(ROOM, {
      scrollTop: 960,
      firstVisibleMessageId: "m-read",
      anchorOffsetPx: -12,
      stickToBottom: false,
      updatedAt: t0,
    });
    saveMessengerRoomScrollPosition(ROOM, { scrollTop: 0, firstVisibleMessageId: null, stickToBottom: false });
    expect(peekMessengerRoomScrollPosition(ROOM)).toMatchObject({
      scrollTop: 960,
      firstVisibleMessageId: "m-read",
      anchorOffsetPx: -12,
    });
    // 맨 아래 상태는 그대로 기록
    saveMessengerRoomScrollPosition(ROOM, { scrollTop: 0, firstVisibleMessageId: null, stickToBottom: true });
    expect(peekMessengerRoomScrollPosition(ROOM)?.stickToBottom).toBe(true);
  });

  it("메시지 보관: 보내는 중 제외 · 최신 쪽 상한 · 방 수 상한 · 30분 · 위치 지우면 같이 지움", () => {
    const msgs = Array.from({ length: MESSENGER_ROOM_RETURN_HISTORY_MAX_MESSAGES + 5 }, (_, i) => ({
      id: `m${i}`,
      pending: false,
    }));
    saveMessengerRoomReturnHistory(ROOM, [...msgs, { id: "tmp", pending: true }], 1_000);
    const kept = peekMessengerRoomReturnHistory(ROOM, 2_000)!;
    expect(kept.length).toBe(MESSENGER_ROOM_RETURN_HISTORY_MAX_MESSAGES);
    expect(kept[0]!.id).toBe("m5");
    expect(kept.some((m) => m.id === "tmp")).toBe(false);
    expect(peekMessengerRoomReturnHistory(ROOM, 1_000 + MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS + 1)).toBeNull();

    for (let r = 0; r < MESSENGER_ROOM_RETURN_HISTORY_MAX_ROOMS + 1; r += 1) {
      saveMessengerRoomReturnHistory(`room-${r}`, [{ id: "x" }], 5_000 + r);
    }
    expect(peekMessengerRoomReturnHistory("room-0", 6_000)).toBeNull();
    expect(peekMessengerRoomReturnHistory(`room-${MESSENGER_ROOM_RETURN_HISTORY_MAX_ROOMS}`, 6_000)).not.toBeNull();

    saveMessengerRoomReturnHistory(ROOM, [{ id: "a" }]);
    clearMessengerRoomScrollPosition(ROOM);
    expect(peekMessengerRoomReturnHistory(ROOM)).toBeNull();
  });
});
