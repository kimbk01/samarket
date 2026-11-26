// @vitest-environment jsdom
/**
 * 감사 2026-11-26 D2 — 알림 탭으로 켠 실행은 채팅방 데이터를 게이트와 같은 함수(같은 단일 비행)로 미리 받는다.
 */
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchRoom = vi.fn(async () => null);
const warm = vi.fn();
vi.mock("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client", () => ({
  fetchCommunityMessengerRoomBootstrapClient: fetchRoom,
}));
vi.mock("@/lib/community-messenger/room/cm-room-route-chunk-warm", () => ({
  warmCommunityMessengerRoomRouteChunks: warm,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mountWith(target: string | null) {
  vi.resetModules();
  fetchRoom.mockClear();
  warm.mockClear();
  const bridge: { pendingLaunchRoutePath?: () => string } = {};
  if (target !== null) bridge.pendingLaunchRoutePath = () => target;
  (window as unknown as { DibayBootBridge: unknown }).DibayBootBridge = bridge;
  const { LaunchPushRoomPrefetch } = await import("@/components/push/LaunchPushRoomPrefetch");
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => {
    root.render(<LaunchPushRoomPrefetch />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  root.unmount();
}

afterEach(() => {
  delete (window as unknown as { DibayBootBridge?: unknown }).DibayBootBridge;
});

describe("LaunchPushRoomPrefetch", () => {
  it("채팅방 목적지면 방 JS 예열 + 게이트와 같은 함수로 데이터 1회", async () => {
    await mountWith("/community-messenger/rooms/1de13b3e-ba94-49bf-b611-582ef3f39ab9");
    expect(warm).toHaveBeenCalledWith("launch_push");
    expect(fetchRoom).toHaveBeenCalledTimes(1);
    expect(fetchRoom).toHaveBeenCalledWith("1de13b3e-ba94-49bf-b611-582ef3f39ab9");
  });
  it("통화 경로·채팅방 아닌 목적지·목적지 없음은 무동작", async () => {
    for (const t of ["/community-messenger/calls/abc", "/mypage", null]) {
      await mountWith(t);
      expect(fetchRoom).not.toHaveBeenCalled();
      expect(warm).not.toHaveBeenCalled();
    }
  });
  it("구조: 알림 수신자(통화 분기 포함) 파일은 이 미리 받기를 부르지 않는다 — 별도 컴포넌트로만", () => {
    const listener = readFileSync("components/push/PushRouteListener.tsx", "utf8");
    expect(listener).not.toContain("LaunchPushRoomPrefetch");
    expect(listener).not.toContain("fetchCommunityMessengerRoomBootstrapClient");
    const tree = readFileSync("components/layout/MainAppProviderTree.tsx", "utf8");
    expect(tree).toMatch(/<PushRouteListener \/>\s*<LaunchPushRoomPrefetch \/>/);
  });
});
