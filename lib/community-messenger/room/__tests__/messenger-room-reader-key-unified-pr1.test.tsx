// @vitest-environment jsdom
/**
 * PR-1 F2 키 통일 — 라우트 id ≠ 스트림 id 인 방.
 * 조건: URL `/community-messenger/rooms/<product_chats.id>`(거래 채팅 id)로 연 방 — 서버가 정규
 * `community_messenger_rooms.id` 로 풀고(`messengerRoomCanonicalOrJsonError` → resolveProductChat), 화면의 스트림 id
 * (`snapshot.room.id`)는 정규 id, phase1 `roomId` 는 라우트 id 로 남는다.
 * 진입 스크롤 controller 가 읽기 상태를 라우트 id 로 쓰면 「↓」(스트림 id 로 읽음)가 어긋난다 → 쓰기·읽기 모두 정규 id.
 */
import { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => ({
  useI18n: () => ({ t: (k: string) => k, safeT: (k: string) => k, language: "ko" }),
}));

import { useMessengerRoomScrollAnchorController } from "@/lib/community-messenger/room/messenger-room-scroll-anchor-controller";
import { MessengerRoomNewMessagesBelowChip } from "@/components/community-messenger/room/MessengerRoomNewMessagesBelowChip";
import {
  resetMessengerRoomReaderStateStore,
  useMessengerRoomReaderStateStore,
} from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { countUnreadMessagesBelow } from "@/lib/community-messenger/room/messenger-room-first-unread";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROUTE_ID = "pc-trade-route-1"; // product_chats.id
const STREAM_ID = "11111111-2222-4333-8444-555555555555"; // community_messenger_rooms.id

type Row = { id: string; isMine: boolean };
const rows: Row[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ id: `m${i + 1}`, isMine: i % 2 === 0 })),
  { id: "m31", isMine: false },
];

function fillViewport(vp: HTMLDivElement, scrollTop: number) {
  const rowH = 50;
  const clientHeight = 400;
  vp.innerHTML = "";
  Object.defineProperty(vp, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(vp, "scrollHeight", { value: rows.length * rowH, configurable: true });
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
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const holder: { api: { onScroll: () => void; vp: HTMLDivElement } | null } = { api: null };

function mount() {
  const vp = document.createElement("div");
  document.body.appendChild(vp);
  function Probe() {
    const viewportRef = useRef<HTMLDivElement | null>(vp);
    const stick = useRef(true);
    const endRef = useRef<HTMLDivElement | null>(null);
    const ctl = useMessengerRoomScrollAnchorController({
      roomId: ROUTE_ID,
      readerRoomId: STREAM_ID,
      activeSheet: null,
      stickToBottomRef: stick,
      messagesViewportRef: viewportRef,
      messageEndRef: endRef,
      roomMessages: rows,
      messageCount: rows.length,
    });
    holder.api = { onScroll: ctl.updateStickToBottomFromScroll, vp };
    const remaining = countUnreadMessagesBelow({
      messages: rows,
      lastReadMessageId: "m30",
      afterMessageId: useMessengerRoomReaderStateStore((s) => s.byRoom[STREAM_ID]?.lastVisibleMessageId ?? null),
    });
    // Timeline 과 같이 스트림 id 로 「↓」를 그린다
    return (
      <MessengerRoomNewMessagesBelowChip
        roomId={STREAM_ID}
        remainingUnreadCount={remaining}
        onJumpToUnread={() => undefined}
        onJumpToLatest={() => undefined}
      />
    );
  }
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<Probe />));
}

function fab() {
  return host?.querySelector("[data-cm-jump-latest-fab]") as HTMLElement | null;
}

beforeEach(() => {
  resetMessengerRoomReaderStateStore();
  document.body.innerHTML = "";
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host = null;
  holder.api = null;
  document.body.innerHTML = "";
});

describe("PR-1 F2 키 통일 — 라우트 id(거래 채팅 id) ≠ 스트림 id(정규 방 id)", () => {
  it("위쪽을 읽는 중 상대 글 수신 → 「↓」 + 배지 1 (스트림 id 로 쓰고 읽음)", () => {
    mount();
    fillViewport(holder.api!.vp, 0);
    act(() => holder.api!.onScroll());
    const st = useMessengerRoomReaderStateStore.getState().byRoom;
    expect(st[STREAM_ID]?.scrollPosition).toBe("reading-history");
    expect(st[ROUTE_ID]).toBeUndefined();
    expect(fab()).not.toBeNull();
    expect(fab()!.getAttribute("data-cm-jump-latest-badge")).toBe("1");
  });

  it("맨 아래에서 상대 글 수신 → 「↓」 숨김", () => {
    mount();
    fillViewport(holder.api!.vp, rows.length * 50 - 400);
    act(() => holder.api!.onScroll());
    expect(useMessengerRoomReaderStateStore.getState().byRoom[STREAM_ID]?.scrollPosition).toBe("at-bottom");
    expect(useMessengerRoomReaderStateStore.getState().byRoom[STREAM_ID]?.lastVisibleMessageId).toBe("m31");
    expect(fab()).toBeNull();
  });

  /**
   * 방 안 읽음 판정(`activeRoomActuallyReadable`)은 `activeRoomId === roomId` 로 본다. `activeRoomId` 는 phase1 이 라우트 id 로
   * 설정한다. 거래 채팅 id URL 방은 스냅샷 뒤 URL 이 정규 id 로 replace 되어 다시 마운트되므로 어긋나는 구간은 스냅샷 전뿐이고,
   * 그 구간의 판정은 main 과 같다. 여기서는 연결만 확인.
   */
  it("연결: phase1 이 정규 스트림 id 를 읽기 키로 넘기고, 방 안 읽음 판정은 열린 방(activeRoomId) 비교", () => {
    const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    const phase1 = read("lib/community-messenger/room/use-messenger-room-client-phase1.ts");
    expect(phase1).toMatch(/useMessengerRoomReaderScrollBottom\(\{\s*roomId,\s*\/\*\*[^*]*\*\/\s*readerRoomId: streamRoomId,/);
    expect(phase1).toMatch(/useMessengerRoomOpenMarkReadEffect\(\{\s*roomId,\s*readerRoomId: streamRoomId,/);
    expect(phase1).toContain("useMessengerRoomReaderScrollRoomLifecycle({ roomId, streamRoomId });");
    const store = read("lib/community-messenger/stores/messenger-realtime-store.ts");
    const fn = store.slice(store.indexOf("function activeRoomActuallyReadable("), store.indexOf("function countTrackedRoomKeys("));
    expect(fn).not.toContain("routeRoom !== roomId");
    expect(fn).toContain("activeRoomId !== roomId");
    const ctl = read("lib/community-messenger/room/messenger-room-scroll-anchor-controller.ts");
    expect(ctl).not.toMatch(/setScrollPosition\((roomId|rid),/);
    expect(ctl).not.toMatch(/setLastVisibleMessageId\((roomId|rid),/);
  });
});
