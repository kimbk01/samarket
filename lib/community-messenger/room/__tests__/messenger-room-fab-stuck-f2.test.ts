// @vitest-environment jsdom
/**
 * F2 (설계 2026-11-18 PR-1) 「↓」 고착 — 위치·lastVisible 은 viewport 동기화만 쓴다.
 * jsdom viewport(scrollHeight·clientHeight·scrollTop)와 행 사각형을 흉내 내 실제 판정 함수를 그대로 돌린다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  __resetMessengerRoomEntryUnreadStoreForTest,
  captureMessengerRoomEntryUnread,
  peekMessengerRoomEntryFirstUnreadId,
} from "@/lib/community-messenger/room/messenger-room-entry-unread-snapshot";
import {
  resetMessengerRoomReaderStateStore,
  useMessengerRoomReaderStateStore,
} from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { syncMessengerRoomReaderStateFromViewport } from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import {
  resolveMessengerRoomMessagesAutoScroll,
  shouldScheduleTailReaderStateSync,
} from "@/lib/community-messenger/room/messenger-room-messages-auto-scroll";
import {
  countUnreadMessagesBelow,
  resolveJumpToLatestFabState,
} from "@/lib/community-messenger/room/messenger-room-first-unread";

const ROOM = "room-f2";

type Row = { id: string; isMine: boolean };

/** viewport 높이 400, 행 높이 50 — scrollTop 으로 보이는 행이 정해진다 */
function makeViewport(rows: Row[], scrollTop: number): HTMLElement {
  const vp = document.createElement("div");
  const rowH = 50;
  const clientHeight = 400;
  const scrollHeight = Math.max(clientHeight, rows.length * rowH);
  Object.defineProperty(vp, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(vp, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(vp, "scrollTop", { value: scrollTop, configurable: true, writable: true });
  vp.getBoundingClientRect = () => ({ top: 0, bottom: clientHeight, left: 0, right: 300, height: clientHeight, width: 300, x: 0, y: 0, toJSON: () => ({}) });
  rows.forEach((r, i) => {
    const el = document.createElement("div");
    el.id = `cm-room-msg-${r.id}`;
    el.setAttribute("data-cm-timeline-message-row", "");
    const top = i * rowH - scrollTop;
    el.getBoundingClientRect = () => ({ top, bottom: top + rowH, left: 0, right: 300, height: rowH, width: 300, x: 0, y: top, toJSON: () => ({}) });
    vp.appendChild(el);
  });
  document.body.appendChild(vp);
  return vp;
}

function sync(vp: HTMLElement) {
  syncMessengerRoomReaderStateFromViewport({ viewport: vp, stickToBottomRef: { current: true }, roomId: ROOM, activeSheet: null });
}

function fab(rows: Row[], lastReadMessageId: string) {
  const st = useMessengerRoomReaderStateStore.getState().byRoom[ROOM];
  const pos = st?.scrollPosition ?? null;
  const remaining = countUnreadMessagesBelow({ messages: rows, lastReadMessageId, afterMessageId: st?.lastVisibleMessageId ?? null });
  return resolveJumpToLatestFabState({ atLatest: pos === "at-bottom" || pos === "near-bottom", remainingUnreadCount: remaining });
}

const rowsN = (n: number, peerTail = true): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, isMine: !(peerTail && i === n - 1) && i % 2 === 0 }));

beforeEach(() => {
  resetMessengerRoomReaderStateStore();
  __resetMessengerRoomEntryUnreadStoreForTest();
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("F2 「↓」 고착", () => {
  it("맨 아래 + 상대 글 1개(unread 1) → capture 가 위치를 덮지 않고, 병합 뒤 동기화로 FAB 숨김", () => {
    const before = rowsN(20, false);
    sync(makeViewport(before, 20 * 50 - 400));
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.scrollPosition).toBe("at-bottom");
    // 상대 글 도착 → 목록 unreadCount 1 → capture (예전: 여기서 reading-history 로 덮어씀)
    const after = [...before, { id: "m21", isMine: false }];
    captureMessengerRoomEntryUnread({ roomId: ROOM, unreadCount: 1, firstUnreadMessageId: "m21" });
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.scrollPosition).toBe("at-bottom");
    // 따라가기 뒤 레이아웃 → S3 동기화(맨 아래, 새 글 보임)
    document.body.innerHTML = "";
    sync(makeViewport(after, 21 * 50 - 400));
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.lastVisibleMessageId).toBe("m21");
    expect(fab(after, "m20")).toEqual({ visible: false, badgeCount: 0 });
  });

  it("짧은 방 미읽음 진입(스크롤 이벤트 없음) → 진입 완료 동기화로 FAB 숨김", () => {
    const rows = rowsN(4);
    captureMessengerRoomEntryUnread({ roomId: ROOM, unreadCount: 1, firstUnreadMessageId: "m4" });
    sync(makeViewport(rows, 0));
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.scrollPosition).toBe("at-bottom");
    expect(fab(rows, "m3")).toEqual({ visible: false, badgeCount: 0 });
  });

  it("첫 안 읽음 이동 후 맨 아래 도착 → 도착 위치 동기화로 FAB 숨김", () => {
    const rows = rowsN(30);
    // 이동 시작 시 컨트롤러가 「읽는 중」으로 써 둔 상태
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "reading-history");
    useMessengerRoomReaderStateStore.getState().setLastVisibleMessageId(ROOM, "m25");
    sync(makeViewport(rows, 30 * 50 - 400));
    expect(fab(rows, "m24")).toEqual({ visible: false, badgeCount: 0 });
  });

  it("위쪽을 읽는 중 수신 → FAB + 배지 유지", () => {
    const rows = [...rowsN(30, false), { id: "m31", isMine: false }];
    sync(makeViewport(rows, 0));
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]?.scrollPosition).toBe("reading-history");
    expect(fab(rows, "m30")).toEqual({ visible: true, badgeCount: 1 });
  });

  it("진입 구분선(첫 안 읽음 id)은 capture 그대로", () => {
    captureMessengerRoomEntryUnread({ roomId: ROOM, unreadCount: 3, firstUnreadMessageId: "m8" });
    expect(peekMessengerRoomEntryFirstUnreadId(ROOM)).toBe("m8");
    expect(useMessengerRoomReaderStateStore.getState().byRoom[ROOM]).toBeUndefined();
  });

  it("방 안 소리 판정: capture 뒤에도 맨 아래면 「읽을 수 있음」(at-bottom) 유지", () => {
    useMessengerRoomReaderStateStore.getState().setScrollPosition(ROOM, "at-bottom");
    captureMessengerRoomEntryUnread({ roomId: ROOM, unreadCount: 2, firstUnreadMessageId: "m1" });
    expect(useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(ROOM)).toBe("at-bottom");
  });

  it("소스 계약: 첫 안 읽음 이동 onDone·애니메이션 없는 이동·진입 완료·끝 메시지 병합이 viewport 동기화를 지난다", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts"),
      "utf8"
    );
    const toMessage = src.slice(src.indexOf("const scrollMessengerToMessage = useCallback("), src.indexOf("const updateStickToBottomFromScroll"));
    expect(toMessage.match(/syncMessengerRoomReaderStateFromViewport\(/g)?.length).toBe(2);
    const complete = src.slice(src.indexOf("const completeEntryPhase = useCallback("), src.indexOf("const tryCompleteEntry = useCallback("));
    expect(complete).toContain("syncMessengerRoomReaderStateFromViewport(");
    expect(src).toMatch(/shouldScheduleTailReaderStateSync\(\{\s*tailChanged,\s*decision,/);
    const snap = readFileSync(
      path.join(process.cwd(), "lib/community-messenger/room/messenger-room-entry-unread-snapshot.ts"),
      "utf8"
    );
    expect(snap).not.toContain("setScrollPosition(");
  });
});

describe("F2-③ 끝 메시지 S3 예약 규칙 (재검토)", () => {
  const decide = (prev: { id: string; cid: string | null }, cur: { id: string; cid: string | null; mine: boolean }) =>
    resolveMessengerRoomMessagesAutoScroll({
      previousTailMessageId: prev.id,
      currentTailMessageId: cur.id,
      currentTailIsMine: cur.mine,
      previousTailClientMessageId: prev.cid,
      currentTailClientMessageId: cur.cid,
    });

  it("내 글 ack 로 id 만 바뀜(skip_ack_id_replace) + 엔진 맨 아래 고정 → 건너뜀(높이 정착 전 viewport 읽기 방지)", () => {
    const decision = decide({ id: "pending:r:1", cid: "c1" }, { id: "srv-1", cid: "c1", mine: true });
    expect(decision).toEqual({ scroll: false, reason: "skip_ack_id_replace" });
    expect(shouldScheduleTailReaderStateSync({ tailChanged: true, decision, engineStickToBottom: true })).toBe(false);
    // 위쪽을 읽는 중이면(엔진 stick 아님) 예약 — 실제 위치로 맞춤
    expect(shouldScheduleTailReaderStateSync({ tailChanged: true, decision, engineStickToBottom: false })).toBe(true);
  });

  it("내 글 전송(force) 건너뜀 · 상대 글 수신은 예약 · 끝 id 그대로면 안 함", () => {
    const own = decide({ id: "m1", cid: null }, { id: "pending:r:2", cid: "c2", mine: true });
    expect(shouldScheduleTailReaderStateSync({ tailChanged: true, decision: own, engineStickToBottom: true })).toBe(false);
    const peer = decide({ id: "m1", cid: null }, { id: "m2", cid: null, mine: false });
    expect(shouldScheduleTailReaderStateSync({ tailChanged: true, decision: peer, engineStickToBottom: true })).toBe(true);
    expect(shouldScheduleTailReaderStateSync({ tailChanged: true, decision: peer, engineStickToBottom: false })).toBe(true);
    expect(shouldScheduleTailReaderStateSync({ tailChanged: false, decision: peer, engineStickToBottom: false })).toBe(false);
  });
});
