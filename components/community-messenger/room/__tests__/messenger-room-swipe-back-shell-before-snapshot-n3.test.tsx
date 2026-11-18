// @vitest-environment jsdom
/**
 * N3 (docs/audit/messenger-chat-redesign-2026-11-18.md PR-2 2a) — 알림 방 로딩 중(스냅샷 전, roomType 없음)에도
 * 셸이 페이지 뒤로 주인을 등록하고, 목적지는 누른 순간 계산한다(roomType 없으면 URL `cm_list` → 없으면 대화 목록).
 * 「방을 찾을 수 없음」 버튼도 같은 함수(셸 requestAnimatedBack → resolveBackTarget)를 쓴다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() };
const entryOrigin = { value: "push" as "push" | "in_app" | "first_entry" };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/community-messenger/rooms/room-1",
}));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({
  useIsMessengerSplitViewport: () => false,
}));
vi.mock("@/lib/community-messenger/room/messenger-room-entry-origin-store", () => ({
  resolveMessengerRoomEntryOrigin: () => entryOrigin.value,
}));
/** 「방을 찾을 수 없음」 화면만 — 스냅샷 없음·로딩 끝 */
vi.mock("@/lib/community-messenger/room/phase2", () => ({
  useMessengerRoomPhase2Controller: () => ({
    snapshot: null,
    loading: false,
    t: (key: string) => key,
    router,
  }),
}));
vi.mock("@/lib/community-messenger/realtime/typing/use-community-messenger-room-typing", () => ({
  useCommunityMessengerRoomTypingRuntime: () => {},
}));

import { MessengerRoomSwipeBackShell } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import CommunityMessengerRoomClientPhase2Body from "@/components/community-messenger/room/CommunityMessengerRoomClientPhase2Body";
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import {
  __setOverlayBackListenerDriverForTests,
  hasPageBackOwner,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

const driverState = {
  onBack: null as null | ((ev: { canGoBack?: boolean }) => void),
  installs: 0,
  removes: 0,
};
const driver: OverlayBackListenerDriver = {
  install(onBack) {
    driverState.installs += 1;
    driverState.onBack = onBack;
    return () => {
      driverState.removes += 1;
      driverState.onBack = null;
    };
  },
};

let container: HTMLDivElement;
let root: Root;

function render(roomType: string | null, roomListKind: "trade" | "delivery" | "general" | null = null) {
  act(() => {
    root.render(
      <MessengerRoomSwipeBackShell roomId="room-1" roomType={roomType} roomListKind={roomListKind}>
        <div>body</div>
      </MessengerRoomSwipeBackShell>
    );
  });
}

function pressSystemBack() {
  act(() => {
    driverState.onBack?.({ canGoBack: true });
  });
}

beforeEach(() => {
  router.back.mockReset();
  router.replace.mockReset();
  entryOrigin.value = "push";
  driverState.installs = 0;
  driverState.removes = 0;
  __setOverlayBackListenerDriverForTests(driver);
  vi.spyOn(console, "info").mockImplementation(() => {});
  /** 움직임 줄이기 — requestAnimatedBack 이 애니메이션 없이 바로 이동(목적지만 본다) */
  vi.stubGlobal(
    "matchMedia",
    vi.fn((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
  );
  window.history.replaceState(null, "", "/community-messenger/rooms/room-1");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  __setOverlayBackListenerDriverForTests(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("N3 — 스냅샷 전 ◁", () => {
  it("roomType 없음 + cm_list 없음 → 주인 등록, ◁ = 대화 목록 replace", () => {
    render(null);
    expect(hasPageBackOwner()).toBe(true);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=chats", { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });

  it("roomType 없음 + URL cm_list → cm_list 목록 replace", () => {
    window.history.replaceState(null, "", "/community-messenger/rooms/room-1?cm_list=trade");
    render(null);
    expect(hasPageBackOwner()).toBe(true);
    pressSystemBack();
    const expected = buildMessengerRoomListBackHref(new URLSearchParams("cm_list=trade"));
    expect(router.replace).toHaveBeenCalledWith(expected, { scroll: false });
  });

  it("스냅샷 도착 뒤에는 누른 순간의 방 종류로 계산(오픈 그룹 = 모임 허브)", () => {
    render(null);
    render("open_group");
    expect(hasPageBackOwner()).toBe(true);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledWith(SAMARKET_ROUTES.chat.messengerMeetingsHub, { scroll: false });
  });

  it("앱 안 진입(in_app)은 스냅샷 전에도 주인 미등록(지금 동작 — WebView 기본 뒤로)", () => {
    entryOrigin.value = "in_app";
    render(null);
    expect(hasPageBackOwner()).toBe(false);
  });

  it("언마운트하면 주인 해제", () => {
    render(null);
    expect(hasPageBackOwner()).toBe(true);
    act(() => root.unmount());
    expect(hasPageBackOwner()).toBe(false);
    root = createRoot(container);
  });
});

describe("N3 — 스냅샷 도착 때 네이티브 ◁ 리스너 재설치 없음", () => {
  it("first_entry + 스냅샷 전 등록 → 스냅샷 도착: install 1·remove 0 → ◁ 1회 = 방 종류 목록 replace", () => {
    entryOrigin.value = "first_entry";
    render(null);
    expect(driverState.installs).toBe(1);
    expect(driverState.removes).toBe(0);
    render("direct", "trade");
    expect(driverState.installs).toBe(1);
    expect(driverState.removes).toBe(0);
    expect(hasPageBackOwner()).toBe(true);
    pressSystemBack();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/trade-chats", { scroll: false });
  });
});

/**
 * 아래 「방 없음」 3건은 합성 시나리오다 — 운영에서는 셸 roomType=null(게이트 스냅샷 없음)과 「방을 찾을 수 없음」
 * 화면(방 클라이언트 마운트 뒤 스냅샷 없음)이 같이 나오지 않는다(`CommunityMessengerRoomBootstrapGate.tsx` 278-313:
 * 스냅샷이 없으면 EntryEmpty, 방 클라이언트는 스냅샷이 있을 때만). 버튼이 셸과 같은 목적지 함수를 쓰는지만 본다.
 */
describe("N3 — 「방을 찾을 수 없음」 버튼 = 같은 함수(렌더)", () => {
  function notFoundButton(): HTMLButtonElement {
    const btn = container.querySelector("button");
    if (!(btn instanceof HTMLButtonElement)) throw new Error("not-found button missing");
    return btn;
  }

  it("셸 안: 버튼 = ◁ 와 같은 목적지(roomType 없음 → 대화 목록 replace 1회)", () => {
    act(() => {
      root.render(
        <MessengerRoomSwipeBackShell roomId="room-1" roomType={null}>
          <CommunityMessengerRoomClientPhase2Body />
        </MessengerRoomSwipeBackShell>
      );
    });
    expect(container.textContent).toContain("cm_ui_cannot_find_chat_room");
    act(() => notFoundButton().click());
    expect(router.replace).toHaveBeenCalledTimes(1);
    const viaButton = router.replace.mock.calls[0];

    router.replace.mockReset();
    act(() => root.unmount());
    root = createRoot(container);
    render(null);
    pressSystemBack();
    expect(router.replace.mock.calls[0]).toEqual(viaButton);
    expect(viaButton).toEqual(["/community-messenger?section=chats", { scroll: false }]);
  });

  it("셸 안 + URL cm_list: 버튼 = cm_list 목록", () => {
    window.history.replaceState(null, "", "/community-messenger/rooms/room-1?cm_list=trade");
    act(() => {
      root.render(
        <MessengerRoomSwipeBackShell roomId="room-1" roomType={null}>
          <CommunityMessengerRoomClientPhase2Body />
        </MessengerRoomSwipeBackShell>
      );
    });
    act(() => notFoundButton().click());
    expect(router.replace).toHaveBeenCalledWith(
      buildMessengerRoomListBackHref(new URLSearchParams("cm_list=trade")),
      { scroll: false }
    );
  });

  it("셸 밖(requestAnimatedBack 없음): 같은 목적지 함수로 대화 목록 replace", () => {
    act(() => {
      root.render(<CommunityMessengerRoomClientPhase2Body />);
    });
    act(() => notFoundButton().click());
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=chats", { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });
});
