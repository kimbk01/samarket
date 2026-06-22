import { describe, expect, it } from "vitest";
import {
  isVideoPipFirstOutgoingPhase,
  shouldAllowPipPointerInteraction,
  shouldMountLocalVideoPipShell,
  shouldMountPipBeforeJoin,
  shouldRetainPrimedDeviceStreamForVideoPreview,
  shouldShowLocalVideoPipChrome,
  shouldShowOutgoingAuxPipPreviewSlot,
  shouldShowPipFirstLocalPreviewChrome,
  shouldUseBackgroundCallSplitPreview,
  shouldSuppressCameraPreparingOverlayForPipFirst,
  shouldUsePipFirstLocalSlot,
  shouldUseSoloLocalFullVideoLayout,
} from "@/lib/community-messenger/call-video-layout";

describe("shouldUseSoloLocalFullVideoLayout", () => {
  it("full local during callee video ringing (legacy non-pip-first)", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "ringing",
        joined: false,
      })
    ).toBe(true);
  });

  it("full local during active before Agora join (legacy non-initiator path)", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: false,
      })
    ).toBe(true);
  });

  it("legacy: callee active before join still solo full until pip-first callee slot at bind", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: false,
        isInitiator: false,
      })
    ).toBe(true);
  });

  it("PiP-first: initiator ringing uses solo full local on main (not hero split)", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "ringing",
        joined: false,
        isInitiator: true,
      })
    ).toBe(true);
  });

  it("PiP-first: initiator active pre-remote uses solo full local on main", () => {
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

describe("PiP-first video layout policy", () => {
  it("outgoing video ringing uses PiP-first pre-remote tile", () => {
    const args = {
      callKind: "video" as const,
      sessionStatus: "ringing" as const,
      isInitiator: true,
      joined: false,
      remoteJoined: false,
    };
    expect(isVideoPipFirstOutgoingPhase(args)).toBe(true);
    expect(shouldUsePipFirstLocalSlot(args)).toBe(true);
  });

  it("outgoing video mounts PiP shell before join", () => {
    const args = {
      callKind: "video" as const,
      sessionStatus: "ringing" as const,
      isInitiator: true,
      joined: false,
      remoteJoined: false,
    };
    expect(shouldMountPipBeforeJoin(args)).toBe(true);
    expect(
      shouldMountLocalVideoPipShell({
        videoCall: true,
        sessionStatus: "ringing",
        joined: false,
        isInitiator: true,
        remoteJoined: false,
      })
    ).toBe(true);
  });

  it("outgoing aux PiP slot hidden until remote joins (main stays full screen)", () => {
    expect(
      shouldShowOutgoingAuxPipPreviewSlot({
        pipFirstOutgoing: true,
        localVideoReady: false,
        remoteJoined: false,
      })
    ).toBe(false);
    expect(
      shouldShowOutgoingAuxPipPreviewSlot({
        pipFirstOutgoing: true,
        localVideoReady: false,
        remoteJoined: true,
      })
    ).toBe(true);
  });

  it("background minimized PiP uses split preview when both videos ready", () => {
    expect(
      shouldUseBackgroundCallSplitPreview({
        callKind: "video",
        joined: true,
        localVideoReady: true,
        remoteJoined: true,
        remoteVideoReady: true,
      })
    ).toBe(true);
    expect(
      shouldUseBackgroundCallSplitPreview({
        callKind: "video",
        joined: true,
        localVideoReady: false,
        remoteJoined: true,
        remoteVideoReady: true,
      })
    ).toBe(false);
  });

  it("callee accept uses PiP local slot; remote remains main layout path", () => {
    const args = {
      callKind: "video" as const,
      sessionStatus: "active" as const,
      isInitiator: false,
      joined: true,
      remoteJoined: false,
    };
    expect(shouldUsePipFirstLocalSlot(args)).toBe(true);
    expect(shouldUseSoloLocalFullVideoLayout({ ...args })).toBe(false);
  });

  it("camera preparing overlay suppressed on PiP-first main (always)", () => {
    expect(
      shouldSuppressCameraPreparingOverlayForPipFirst({
        pipFirstOutgoing: true,
      })
    ).toBe(true);
    expect(
      shouldSuppressCameraPreparingOverlayForPipFirst({
        pipFirstOutgoing: false,
        preJoinReady: true,
      })
    ).toBe(false);
  });

  it("shows PiP preview chrome only after remote joins on pip-first outgoing", () => {
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: true,
        pipShellMounted: true,
        preJoinReady: true,
        localVideoReady: false,
        remoteJoined: false,
      })
    ).toBe(false);
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: true,
        pipShellMounted: true,
        preJoinReady: true,
        localVideoReady: false,
        remoteJoined: true,
      })
    ).toBe(true);
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

  it("does not mount PiP shell before join on non-pip-first paths", () => {
    expect(shouldMountLocalVideoPipShell({ videoCall: true, joined: false })).toBe(false);
    expect(
      shouldMountLocalVideoPipShell({
        videoCall: true,
        sessionStatus: "ringing",
        joined: false,
        isInitiator: false,
        remoteJoined: false,
      })
    ).toBe(false);
  });

  it("does not mount after terminal", () => {
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
