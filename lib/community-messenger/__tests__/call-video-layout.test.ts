import { describe, expect, it } from "vitest";
import {
  isVideoPipFirstOutgoingPhase,
  resolveCallDefaultPipCorner,
  resolveCallOverlayBackdropMode,
  shouldAllowPipPointerInteraction,
  shouldDefaultPipCornerTop,
  shouldMountLocalVideoPipShell,
  shouldMountPipBeforeJoin,
  shouldRetainPrimedDeviceStreamForVideoPreview,
  shouldShowLocalVideoPipChrome,
  shouldShowPipFirstLocalPreviewChrome,
  shouldSuppressCameraPreparingOverlayForPipFirst,
  shouldUsePipFirstLocalSlot,
  shouldUseSoloLocalFullVideoLayout,
  shouldUseTranslucentCallShell,
  shouldUseTransparentMainVideoSlotRoot,
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
        pipFirstOutgoing: true,
        pipShellMounted: false,
        preJoinReady: true,
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

describe("call overlay backdrop policy", () => {
  it("voice uses voice-gradient backdrop", () => {
    expect(
      resolveCallOverlayBackdropMode({
        mode: "voice",
        direction: "outgoing",
        phase: "ringing",
      })
    ).toBe("voice-gradient");
  });

  it("video connected remote uses remote-video-dim", () => {
    expect(
      resolveCallOverlayBackdropMode({
        mode: "video",
        direction: "outgoing",
        phase: "connected",
        showRemoteVideo: true,
      })
    ).toBe("remote-video-dim");
  });

  it("video pre-remote placeholder uses peer-blur-dim", () => {
    expect(
      resolveCallOverlayBackdropMode({
        mode: "video",
        direction: "outgoing",
        phase: "ringing",
        pipFirstOutgoingMainPlaceholder: true,
      })
    ).toBe("peer-blur-dim");
  });
});

describe("translucent call shell policy", () => {
  it("overlay and page variants use translucent shell", () => {
    expect(shouldUseTranslucentCallShell({ variant: "overlay" })).toBe(true);
    expect(shouldUseTranslucentCallShell({ variant: "page" })).toBe(true);
  });

  it("dock-top keeps opaque shell for room dock", () => {
    expect(shouldUseTranslucentCallShell({ variant: "dock-top" })).toBe(false);
  });
});

describe("transparent main video slot root", () => {
  it("PiP-first placeholder avoids opaque main fill", () => {
    expect(
      shouldUseTransparentMainVideoSlotRoot({
        videoCall: true,
        pipFirstOutgoingMainPlaceholder: true,
      })
    ).toBe(true);
  });

  it("remote video main keeps opaque root option", () => {
    expect(
      shouldUseTransparentMainVideoSlotRoot({
        videoCall: true,
        showRemoteVideo: true,
        pipFirstOutgoingMainPlaceholder: true,
      })
    ).toBe(false);
  });
});

describe("PiP default corner policy", () => {
  it("video in-call PiP defaults to top-right", () => {
    expect(shouldDefaultPipCornerTop({ videoCall: true, pipShellMounted: true })).toBe(true);
    expect(resolveCallDefaultPipCorner({ videoCall: true, pipShellMounted: true })).toBe("topRight");
  });

  it("non-video keeps bottom-right fallback", () => {
    expect(shouldDefaultPipCornerTop({ videoCall: false, pipShellMounted: true })).toBe(false);
    expect(resolveCallDefaultPipCorner({ videoCall: false, pipShellMounted: true })).toBe("bottomRight");
  });
});
