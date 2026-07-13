// @vitest-environment jsdom
/**
 * Phase 3 — Canonical Projection READ adapter 정합성 테스트.
 *
 * 목적: Read 후 canonical store 가 갱신되면 실제 Render 입력(homeListRenderData)도 canonical 권위값으로
 * 재계산되어야 한다(Root Cause: MEMO_DEPENDENCY_STALE 회귀 방지). legacy 모드는 무해(참조 동일) 유지.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCanonicalHomeListRooms, useMessengerHomeCanonicalListData } from "@/lib/community-messenger/home/canonical-home-render-adapter";
import { createMessengerHomeShadowDispatch, type MessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const ROOM_ID = "3932dd99-2a06-402a-8041-e3f27af2fa81";
const VIEWER_ID = "11111111-1111-1111-1111-111111111111";

function roomSummary(overrides: Partial<CommunityMessengerRoomSummary> = {}): CommunityMessengerRoomSummary {
  return {
    id: ROOM_ID,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Legacy Title",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "hello",
    lastMessageType: "text",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: true,
    messengerDirectKey: null,
    contextMeta: null,
    ...overrides,
  };
}

function legacyBootstrap(chatRoom: CommunityMessengerRoomSummary): CommunityMessengerBootstrap {
  return {
    me: { id: VIEWER_ID },
    chats: [chatRoom],
    groups: [],
  } as unknown as CommunityMessengerBootstrap;
}

/** canonical store 에 방을 seed 한다(= writer 가 반영한 상태를 흉내). */
function seedCanonical(dispatch: MessengerHomeShadowDispatch, room: CommunityMessengerRoomSummary, generation = 1): void {
  dispatch.dispatchRoomSummary("full", generation, room);
}

describe("canonical-home-render-adapter — authority (buildCanonicalHomeListRooms)", () => {
  it("canonical unread 가 legacy unread 를 대체한다 (legacy=2, canonical=0 → 0)", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    expect(dispatch.mode).toBe("shadow");
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }));
    const legacy = legacyBootstrap(roomSummary({ unreadCount: 2 }));

    const built = buildCanonicalHomeListRooms(legacy, dispatch, "all");
    expect(built.fellBackToLegacy).toBe(false);
    expect(built.chats).toHaveLength(1);
    expect(built.chats[0]!.unreadCount).toBe(0);
  });

  it("cosmetic(title)은 legacy 값을 보존한다", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    seedCanonical(dispatch, roomSummary({ title: "Canonical Ignored", unreadCount: 0 }));
    const legacy = legacyBootstrap(roomSummary({ title: "Legacy Title", unreadCount: 2 }));

    const built = buildCanonicalHomeListRooms(legacy, dispatch, "all");
    expect(built.chats[0]!.title).toBe("Legacy Title");
  });

  it("lastMessageAt 는 canonical(최신)을 사용한다", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    seedCanonical(dispatch, roomSummary({ lastMessageAt: "2026-07-13T09:00:00.000Z", unreadCount: 0 }));
    const legacy = legacyBootstrap(roomSummary({ lastMessageAt: "2026-07-13T00:00:00.000Z", unreadCount: 2 }));

    const built = buildCanonicalHomeListRooms(legacy, dispatch, "all");
    expect(built.chats[0]!.lastMessageAt).toBe("2026-07-13T09:00:00.000Z");
  });

  it("regression — incoming(1→2) 후 read(2→0)에도 bucket 은 direct 유지", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    // incoming
    seedCanonical(dispatch, roomSummary({ unreadCount: 1 }), 1);
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 2);
    let built = buildCanonicalHomeListRooms(legacyBootstrap(roomSummary({ unreadCount: 2 })), dispatch, "all");
    expect(built.chats[0]!.unreadCount).toBe(2);
    expect(built.chats[0]!.roomType).toBe("direct");
    // read
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 3);
    built = buildCanonicalHomeListRooms(legacyBootstrap(roomSummary({ unreadCount: 2 })), dispatch, "all");
    expect(built.chats[0]!.unreadCount).toBe(0);
    expect(built.chats[0]!.roomType).toBe("direct");
  });
});

describe("canonical-home-render-adapter — canonical store revision 신호", () => {
  it("unread 변경 시 peekState() 참조가 바뀌고, 무변경 시 동일 참조를 유지한다", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
    const before = dispatch.peekState();
    // read → unread 0 (변경)
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 2);
    const afterRead = dispatch.peekState();
    expect(afterRead).not.toBe(before);
    // 동일 값 재전송 → 무변경 → 참조 동일 (불필요 재계산 없음)
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 3);
    expect(dispatch.peekState()).toBe(afterRead);
  });
});

describe("shadow — opt-in subscribe/notify (canonicalState 참조 변경 시에만)", () => {
  it("state 변경 event 마다 1회 notify · 동일값 event 는 notify 0 · unsubscribe 후 notify 0", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    let notifyCount = 0;
    const unsubscribe = dispatch.subscribe(() => {
      notifyCount += 1;
    });

    // 신규 방(state 변경) → 1회
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
    expect(notifyCount).toBe(1);
    // read(2→0, state 변경) → 1회
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 2);
    expect(notifyCount).toBe(2);
    // 동일값 재전송(state 무변경) → notify 없음
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 3);
    expect(notifyCount).toBe(2);
    // unsubscribe 후 실제 변경 event 라도 notify 없음
    unsubscribe();
    seedCanonical(dispatch, roomSummary({ unreadCount: 5 }), 4);
    expect(notifyCount).toBe(2);
  });

  it("getEventSequence 는 state 변경 시에만 단조 증가한다", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    expect(dispatch.getEventSequence()).toBe(0);
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
    const seq1 = dispatch.getEventSequence();
    expect(seq1).toBeGreaterThan(0);
    // 동일값 재전송 → 무변경 → sequence 동일
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 2);
    expect(dispatch.getEventSequence()).toBe(seq1);
    // 변경 → 증가
    seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 3);
    expect(dispatch.getEventSequence()).toBeGreaterThan(seq1);
  });

  it("legacy 모드 dispatch 는 event 를 무시하므로 notify 0 (subscribe 는 안전)", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    if (dispatch.mode !== "shadow") {
      let notifyCount = 0;
      dispatch.subscribe(() => {
        notifyCount += 1;
      });
      seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
      expect(notifyCount).toBe(0);
    }
  });
});

describe("canonical-home-render-adapter — hook memo/subscription", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
  });

  function renderAdapter(getArgs: () => Parameters<typeof useMessengerHomeCanonicalListData>[0]) {
    const result: { current: CommunityMessengerBootstrap | null } = { current: null };
    const renderCountRef = { count: 0 };
    function Probe() {
      renderCountRef.count += 1;
      result.current = useMessengerHomeCanonicalListData(getArgs());
      return null;
    }
    const render = () => act(() => root.render(<Probe />));
    render();
    return { result, rerender: render, getRenderCount: () => renderCountRef.count };
  }

  it("canonical 모드: store unread 2→0 이 자동 재렌더를 유발하고 adapter 출력 unread=0 (수동 rerender 없이)", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
    // legacyData 는 read 후에도 unread=2 를 유지(참조 고정)
    const legacyData = legacyBootstrap(roomSummary({ unreadCount: 2 }));

    const { result, getRenderCount } = renderAdapter(() => ({
      legacyData,
      dispatch,
      source: "canonical",
      pillarScope: "all",
    }));
    expect(result.current?.chats?.[0]?.unreadCount).toBe(2);
    const rendersBefore = getRenderCount();

    // read → canonical store 만 0 으로 갱신 (수동 rerender 없이 subscribe 로 자동 재렌더)
    act(() => {
      seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 2);
    });
    expect(getRenderCount()).toBeGreaterThan(rendersBefore); // 자동 재렌더 발생
    expect(result.current?.chats?.[0]?.unreadCount).toBe(0); // adapter 출력 0
  });

  it("legacy 모드: canonical store 변경이 재렌더를 유발하지 않고 homeListRenderData === data (무해)", () => {
    const dispatch = createMessengerHomeShadowDispatch();
    seedCanonical(dispatch, roomSummary({ unreadCount: 2 }), 1);
    const legacyData = legacyBootstrap(roomSummary({ unreadCount: 2 }));

    const { result, getRenderCount } = renderAdapter(() => ({
      legacyData,
      dispatch,
      source: "legacy",
      pillarScope: "all",
    }));
    expect(result.current).toBe(legacyData);
    const rendersBefore = getRenderCount();

    act(() => {
      seedCanonical(dispatch, roomSummary({ unreadCount: 0 }), 2);
    });
    expect(getRenderCount()).toBe(rendersBefore); // canonical 변경으로 재렌더 증가 없음
    expect(result.current).toBe(legacyData); // 참조 동일(무해)
  });
});
