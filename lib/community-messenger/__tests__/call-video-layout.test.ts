import { describe, expect, it } from "vitest";
import {
  shouldAllowPipPointerInteraction,
  shouldMountLocalVideoPipShell,
  shouldRetainPrimedDeviceStreamForVideoPreview,
  shouldShowLocalVideoPipChrome,
  shouldUseSoloLocalFullVideoLayout,
} from "@/lib/community-messenger/call-video-layout";

describe("shouldUseSoloLocalFullVideoLayout", () => {
  it("full local during outgoing ringing", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "ringing",
        joined: false,
      })
    ).toBe(true);
  });

  it("full local during active before Agora join", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: false,
      })
    ).toBe(true);
  });

  it("keeps initiator full local after join until remote publishes", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: true,
        remoteJoined: false,
        isInitiator: true,
      })
    ).toBe(true);
  });

  it("switches initiator to PiP layout after remote joined", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: true,
        remoteJoined: true,
        isInitiator: true,
      })
    ).toBe(false);
  });

  it("PiP layout for callee after join even before remote", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: true,
        remoteJoined: false,
        isInitiator: false,
      })
    ).toBe(false);
  });

  it("not for voice calls", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "voice",
        sessionStatus: "ringing",
        joined: false,
      })
    ).toBe(false);
  });
});

describe("shouldRetainPrimedDeviceStreamForVideoPreview", () => {
  it("retains during ringing and active video", () => {
    expect(
      shouldRetainPrimedDeviceStreamForVideoPreview({ callKind: "video", sessionStatus: "ringing" })
    ).toBe(true);
    expect(
      shouldRetainPrimedDeviceStreamForVideoPreview({ callKind: "video", sessionStatus: "active" })
    ).toBe(true);
  });

  it("does not retain after terminal", () => {
    expect(
      shouldRetainPrimedDeviceStreamForVideoPreview({ callKind: "video", sessionStatus: "ended" })
    ).toBe(false);
  });
});

describe("shouldMountLocalVideoPipShell", () => {
  it("mounts shell when joined before localVideoReady", () => {
    expect(
      shouldMountLocalVideoPipShell({
        videoCall: true,
        sessionStatus: "active",
        joined: true,
      })
    ).toBe(true);
  });

  it("does not mount before join or after terminal", () => {
    expect(shouldMountLocalVideoPipShell({ videoCall: true, joined: false })).toBe(false);
    expect(
      shouldMountLocalVideoPipShell({
        videoCall: true,
        sessionStatus: "ended",
        joined: true,
      })
    ).toBe(false);
  });
});

describe("shouldShowLocalVideoPipChrome", () => {
  it("shows PiP when joined with local track ready", () => {
    expect(
      shouldShowLocalVideoPipChrome({
        videoCall: true,
        sessionStatus: "active",
        joined: true,
        localVideoReady: true,
      })
    ).toBe(true);
  });

  it("hides PiP before join or local ready", () => {
    expect(
      shouldShowLocalVideoPipChrome({ videoCall: true, joined: false, localVideoReady: true })
    ).toBe(false);
    expect(
      shouldShowLocalVideoPipChrome({ videoCall: true, joined: true, localVideoReady: false })
    ).toBe(false);
  });

  it("hides stale PiP after terminal status", () => {
    expect(
      shouldShowLocalVideoPipChrome({
        videoCall: true,
        sessionStatus: "ended",
        joined: true,
        localVideoReady: true,
      })
    ).toBe(false);
  });
});

describe("shouldAllowPipPointerInteraction", () => {
  it("allows drag when shell mounted with gesture bindings", () => {
    expect(
      shouldAllowPipPointerInteraction({ pipShellMounted: true, hasPipGestureBindings: true })
    ).toBe(true);
  });

  it("blocks when shell not mounted or no bindings", () => {
    expect(
      shouldAllowPipPointerInteraction({ pipShellMounted: false, hasPipGestureBindings: true })
    ).toBe(false);
    expect(
      shouldAllowPipPointerInteraction({ pipShellMounted: true, hasPipGestureBindings: false })
    ).toBe(false);
  });
});
