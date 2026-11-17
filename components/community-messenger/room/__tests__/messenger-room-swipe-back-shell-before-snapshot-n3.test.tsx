// @vitest-environment jsdom
/**
 * N3 (docs/audit/messenger-chat-fix-design-2026-11-18.md PR-2) — 알림 방 로딩 중(스냅샷 전, roomType 없음)에도
 * 셸이 페이지 뒤로 주인을 등록하고, 목적지는 누른 순간 계산한다(roomType 없으면 URL `cm_list` → 없으면 대화 목록).
 * 「방을 찾을 수 없음」 버튼도 같은 함수(셸 requestAnimatedBack → resolveBackTarget)를 쓴다.
 */
import { readFileSync } from "node:fs";
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

import { MessengerRoomSwipeBackShell } from "@/components/community-messenger/room/MessengerRoomSwipeBackShell";
import { buildMessengerRoomListBackHref } from "@/lib/community-messenger/messenger-entry-origin";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import {
  __setOverlayBackListenerDriverForTests,
  hasPageBackOwner,
  type OverlayBackListenerDriver,
} from "@/lib/ui/overlay-back-stack";

const driverState = { onBack: null as null | ((ev: { canGoBack?: boolean }) => void) };
const driver: OverlayBackListenerDriver = {
  install(onBack) {
    driverState.onBack = onBack;
    return () => {
      driverState.onBack = null;
    };
  },
};

let container: HTMLDivElement;
let root: Root;

function render(roomType: string | null) {
  act(() => {
    root.render(
      <MessengerRoomSwipeBackShell roomId="room-1" roomType={roomType}>
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

describe("N3 — 「방을 찾을 수 없음」 버튼 = 같은 함수", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const body = strip(readFileSync("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx", "utf8"));
  const shell = strip(readFileSync("components/community-messenger/room/MessengerRoomSwipeBackShell.tsx", "utf8"));

  it("버튼은 셸 requestAnimatedBack(= ◁ 주인과 같은 commitNavigation → resolveBackTarget) 우선, 없으면 같은 목적지 함수", () => {
    expect(body).toMatch(
      /cm_ui_cannot_find_chat_room[\s\S]*?if \(requestAnimatedBack\) \{\s*requestAnimatedBack\(\);\s*return;\s*\}\s*runMessengerRoomBackTarget\(\s*room\.router,\s*resolveMessengerRoomBackTargetNow\(\{ roomType: null, listKind: null, searchParams \}\)/
    );
  });

  it("셸 주인 등록에 roomType == null 조건 없음", () => {
    expect(shell).not.toMatch(/if \(roomType == null \|\| insideOrderChatSlide\) return;/);
    expect(shell).toMatch(/setPageBackOwner\(\(\) => requestAnimatedBackRef\.current\(\)\)/);
  });
});
