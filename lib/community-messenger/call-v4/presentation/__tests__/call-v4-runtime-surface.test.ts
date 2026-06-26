import { describe, expect, it } from "vitest";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import {
  buildCallV4DockSnapshot,
  shouldExposeCallV4DockSnapshot,
} from "@/lib/community-messenger/call-v4/presentation/use-call-v4-runtime-surface";

function createVm(overrides: Partial<CallScreenViewModel> = {}): CallScreenViewModel {
  return {
    visualTheme: "starbucks",
    mode: "video",
    direction: "incoming",
    phase: "connected",
    peerLabel: "Dibay Friend",
    peerAvatarUrl: "https://example.com/a.png",
    statusText: "통화 중",
    connectionLabel: "통화 중",
    connectedAt: 1000,
    endedAt: null,
    endedDurationSeconds: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: true,
      localVideoMinimized: false,
    },
    onBack: null,
    primaryActions: [],
    secondaryActions: [],
    suppressTerminalView: false,
    ...overrides,
  };
}

describe("call-v4 runtime surface model", () => {
  it("exposes dock snapshot only for connected presentation", () => {
    expect(shouldExposeCallV4DockSnapshot({ phase: "connected", vmPhase: "connected" })).toBe(true);
    expect(shouldExposeCallV4DockSnapshot({ phase: "joining", vmPhase: "connecting" })).toBe(false);
    expect(shouldExposeCallV4DockSnapshot({ phase: "ended", vmPhase: "ended" })).toBe(false);
  });

  it("builds a stable dock snapshot without moving video nodes into the dock", () => {
    const snapshot = buildCallV4DockSnapshot(createVm(), "00:12");

    expect(snapshot).toMatchObject({
      peerLabel: "Dibay Friend",
      peerAvatarUrl: "https://example.com/a.png",
      statusText: "통화 중",
      timerText: "00:12",
      micMuted: false,
      cameraOff: false,
      isVideo: true,
      useSplitPreview: false,
    });
    expect(snapshot?.videoThumbSlot).toBeNull();
    expect(snapshot?.remoteVideoThumbSlot).toBeNull();
  });

  it("reflects mute and camera state in dock snapshot", () => {
    const snapshot = buildCallV4DockSnapshot(
      createVm({
        mediaState: {
          micEnabled: false,
          speakerEnabled: true,
          cameraEnabled: false,
          localVideoMinimized: false,
        },
      }),
      null,
    );

    expect(snapshot?.micMuted).toBe(true);
    expect(snapshot?.cameraOff).toBe(true);
  });

  it("returns null for terminal view models", () => {
    expect(buildCallV4DockSnapshot(createVm({ phase: "ended" }), null)).toBeNull();
  });
});
