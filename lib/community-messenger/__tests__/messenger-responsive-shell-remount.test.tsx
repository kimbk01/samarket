/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";

/**
 * SPL-01 / SPL-02 / SPL-03 — messenger 768 split shell.
 * - 방 클라이언트는 768 경계를 넘어도 재마운트되지 않는다 (입력 초안·구독·시트 유지).
 * - 분할 목록은 허브 → 첫 방 진입에서 재마운트되지 않는다.
 * - 분할에서 통화 기록은 우측 패널에 렌더, 통화 화면은 전체 화면(좁은 경로)으로 렌더.
 */
const state = vi.hoisted(() => ({ pathname: "/community-messenger/rooms/r1", wide: false }));
const counts = vi.hoisted(() => ({ roomMount: 0, listMount: 0 }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
}));
vi.mock("@/hooks/use-is-messenger-split-viewport", () => ({
  useIsMessengerSplitViewport: () => state.wide,
}));
vi.mock("@/components/community-messenger/MessengerSplitTopBar", () => ({ MessengerSplitTopBar: () => null }));
vi.mock("@/components/community-messenger/CommunityMessengerHomeReturnConsume", () => ({
  CommunityMessengerHomeReturnConsume: () => null,
}));
vi.mock("@/components/community-messenger/home/CommunityMessengerHomeDetailEmpty", () => ({
  CommunityMessengerHomeDetailEmpty: () => <div data-empty-pane="" />,
}));
vi.mock("@/components/community-messenger/MessengerSplitListPane", () => ({
  MessengerSplitListPane: () => {
    useEffect(() => {
      counts.listMount++;
    }, []);
    return <div>list</div>;
  },
}));

import { MessengerResponsiveShell } from "@/components/community-messenger/MessengerResponsiveShell";

function RoomProbe() {
  useEffect(() => {
    counts.roomMount++;
  }, []);
  return <div data-room-probe="">room</div>;
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(root: ReturnType<typeof createRoot>, node: React.ReactNode) {
  await act(async () => {
    root.render(<MessengerResponsiveShell>{node}</MessengerResponsiveShell>);
  });
}

describe("MessengerResponsiveShell — no remount across 768 (SPL-01/02/03)", () => {
  it("room client stays mounted narrow → wide → narrow on the same URL", async () => {
    counts.roomMount = 0;
    const el = document.createElement("div");
    const root = createRoot(el);
    state.pathname = "/community-messenger/rooms/r1";
    state.wide = false;
    await render(root, <RoomProbe />);
    state.wide = true;
    await render(root, <RoomProbe />);
    state.wide = false;
    await render(root, <RoomProbe />);
    expect(counts.roomMount).toBe(1);
    expect(el.querySelector("[data-room-probe]")).not.toBeNull();
    root.unmount();
  });

  it("split list stays mounted hub → first room → next room", async () => {
    counts.listMount = 0;
    const el = document.createElement("div");
    const root = createRoot(el);
    state.wide = true;
    state.pathname = "/community-messenger";
    await render(root, <div />);
    state.pathname = "/community-messenger/rooms/r9";
    await render(root, <div />);
    state.pathname = "/community-messenger/rooms/r10";
    await render(root, <div />);
    expect(counts.listMount).toBe(1);
    root.unmount();
  });

  it("wide: call logs render in the detail pane; call screens render full-screen", async () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    state.wide = true;
    state.pathname = "/community-messenger/calls/logs";
    await render(root, <div data-route-content="">LOGS</div>);
    expect(el.querySelector("[data-messenger-split-room-pane] [data-route-content]")).not.toBeNull();

    state.pathname = "/community-messenger/calls/session-1";
    await render(root, <div data-route-content="">CALL</div>);
    expect(el.querySelector('[data-messenger-responsive-shell="mobile"] [data-route-content]')).not.toBeNull();

    state.pathname = "/community-messenger/calls-v4/call-1";
    await render(root, <div data-route-content="">CALL4</div>);
    expect(el.querySelector('[data-messenger-responsive-shell="mobile"] [data-route-content]')).not.toBeNull();
    root.unmount();
  });

  it("narrow non-room routes keep the plain full-page shell", async () => {
    const el = document.createElement("div");
    const root = createRoot(el);
    state.wide = false;
    state.pathname = "/community-messenger";
    await render(root, <div data-route-content="">HUB</div>);
    const shell = el.querySelector('[data-messenger-responsive-shell="mobile"]');
    expect(shell?.firstElementChild?.getAttribute("data-route-content")).toBe("");
    root.unmount();
  });
});
