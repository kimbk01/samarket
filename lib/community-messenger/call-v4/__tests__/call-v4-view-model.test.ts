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
    expect(vm?.connectionLabel).toBe("연결 중");
    expect(vm?.mediaState.speakerEnabled).toBe(false);
    expect(vm?.primaryActions).toHaveLength(0);
  });

  it("shows 3-tier connection signal when connected", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(false);

    const vm = buildCallV4ScreenViewModel({
      callId: "call-vm",
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      safeT,
      router,
      mediaState: {
        micEnabled: true,
        speakerEnabled: false,
        cameraEnabled: false,
        localVideoMinimized: true,
        localVideoReady: false,
        remoteVideoReady: false,
        incomingVideoUpgradeRequest: false,
        pendingVideoUpgradeRequest: false,
        connectionSignalTier: "fair",
      },
    });

    expect(vm?.connectionLabel).toBe("통신 상태 보통");
    expect(vm?.connectionSignalTier).toBe("fair");
    expect(vm?.statusText).toBe("통화 중");
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

  it("hides outgoing video brand row and wires connected onBack for outgoing video", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(false);

    const vm = buildCallV4ScreenViewModel({
      callId: "call-out-video",
      phase: "connected",
      identity: {
        ...identity,
        callId: "call-out-video",
        direction: "outgoing",
        mediaType: "video",
      },
      connectedAt: Date.now(),
      safeT,
      router,
      mediaState: {
        micEnabled: true,
        speakerEnabled: true,
        cameraEnabled: true,
        localVideoMinimized: true,
        localVideoReady: true,
        remoteVideoReady: false,
        incomingVideoUpgradeRequest: false,
        pendingVideoUpgradeRequest: false,
        connectionSignalTier: null,
      },
    });

    expect(vm?.hideOutgoingVideoBrandRow).toBe(true);
    expect(vm?.phase).toBe("connected");
    expect(typeof vm?.onBack).toBe("function");
    expect(vm?.mediaState.speakerEnabled).toBe(true);
  });

  it("defaults speaker off for outgoing voice", () => {
    vi.mocked(isNativeAcceptInflight).mockReturnValue(false);

    const vm = buildCallV4ScreenViewModel({
      callId: "call-out-voice",
      phase: "connected",
      identity: {
        ...identity,
        callId: "call-out-voice",
        direction: "outgoing",
        mediaType: "audio",
      },
      connectedAt: Date.now(),
      safeT,
      router,
    });

    expect(vm?.mediaState.speakerEnabled).toBe(false);
  });
});
