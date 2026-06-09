import { describe, expect, it } from "vitest";
import {
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

  it("PiP layout after join even when remote has not published", () => {
    expect(
      shouldUseSoloLocalFullVideoLayout({
        callKind: "video",
        sessionStatus: "active",
        joined: true,
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
