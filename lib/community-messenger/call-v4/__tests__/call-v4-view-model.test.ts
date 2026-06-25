import { describe, expect, it, vi } from "vitest";
import { buildCallV4ScreenViewModel } from "@/lib/community-messenger/call-v4/call-v4-view-model";
import type { CallV4Identity } from "@/lib/community-messenger/call-v4/call-v4-types";

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-accept-flight", () => ({
  isNativeAcceptInflight: vi.fn(),
}));

import { isNativeAcceptInflight } from "@/lib/community-messenger/call-v4/call-v4-native-accept-flight";

const identity: CallV4Identity = {
  callId: "call-vm",
  roomId: "room-1",
  callerUserId: "caller",
  calleeUserId: "callee",
  direction: "incoming",
  mediaType: "audio",
  createdAt: new Date().toISOString(),
  peerLabel: "Caller",
  peerAvatarUrl: null,
};

const safeT = (key: string, options?: { fallbackKo?: string; fallbackEn?: string }) =>
  options?.fallbackKo ?? options?.fallbackEn ?? key;

const router = { replace: vi.fn(), push: vi.fn() };

describe("buildCallV4ScreenViewModel native accept inflight", () => {
  it("does not create accept/reject actions when inflight is true", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(true);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    const vm = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "incoming_ringing",
      identity,
      connectedAt: null,
      safeT,
      router,
    });

    expect(vm?.primaryActions.some((action) => action.id === "accept")).toBe(false);
    expect(vm?.primaryActions.some((action) => action.id === "reject")).toBe(false);
    expect(vm?.subStatusText).toBe("연결 중");
    expect(info.mock.calls.some((call) => call[1] === "incoming_actions_suppressed_native_accept")).toBe(true);
    info.mockRestore();
  });

  it("builds connecting view model when identity is missing during joining", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(false);

    const vm = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "joining",
      identity: null,
      connectedAt: null,
      safeT,
      router,
    });

    expect(vm?.phase).toBe("connecting");
    expect(vm?.statusText).toBe("연결 중");
    expect(vm?.primaryActions).toHaveLength(0);
  });

  it("does not create accept/reject actions when phase is accepting", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(false);

    const vm = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "accepting",
      identity,
      connectedAt: null,
      safeT,
      router,
    });

    expect(vm?.primaryActions.some((action) => action.id === "accept")).toBe(false);
    expect(vm?.primaryActions.some((action) => action.id === "reject")).toBe(false);
    expect(vm?.subStatusText).toBe("연결 중");
  });
});
