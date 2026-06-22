import { describe, expect, it } from "vitest";
import {
  isVideoPipFirstOutgoingPhase,
  shouldAllowPipPointerInteraction,
  shouldMountLocalVideoPipShell,
  shouldMountPipBeforeJoin,
  shouldRetainPrimedDeviceStreamForVideoPreview,
  shouldShowLocalVideoPipChrome,
  shouldShowPipFirstLocalPreviewChrome,
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

  it("PiP-first: initiator ringing is not solo full", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "ringing",
        joined: false,
        isInitiator: true,
      })
    ).toBe(false);
  });

  it("PiP-first: initiator active pre-remote after join is not solo full", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: true,
        remoteJoined: false,
        isInitiator: true,
      })
    ).toBe(false);
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
  it("outgoing video ringing uses PiP-first, not soloLocalFull", () => {
    const args = {
      callKind: "video" as const,
      sessionStatus: "ringing" as const,
      isInitiator: true,
      joined: false,
      remoteJoined: false,
    };
    expect(isVideoPipFirstOutgoingPhase(args)).toBe(true);
    expect(shouldUseSoloLocalFullVideoLayout({ ...args })).toBe(false);
    expect(shouldUsePipFirstLocalSlot(args)).toBe(true);
  });

  it("outgoing video active pre-remote mounts PiP before join", () => {
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

  it("shows PiP preview chrome when PiP-first shell is mounted", () => {
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: true,
        pipShellMounted: true,
        preJoinReady: false,
        localVideoReady: false,
      })
    ).toBe(true);
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: false,
        pipShellMounted: true,
        joined: true,
        localVideoReady: false,
        cameraOff: false,
      })
    ).toBe(true);
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: true,
        pipShellMounted: false,
        preJoinReady: true,
      })
    ).toBe(false);
    expect(
      shouldShowPipFirstLocalPreviewChrome({
        pipFirstOutgoing: false,
        pipShellMounted: true,
        joined: true,
        localVideoReady: false,
        cameraOff: true,
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

  it("mounts shell for PiP-first outgoing before join", () => {
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

  it("does not mount before join for non-pip-first or after terminal", () => {
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
