import { describe, expect, it } from "vitest";
import { resolveCallPresentationState } from "@/lib/community-messenger/call-presentation-state";

describe("resolveCallPresentationState", () => {
  it("outgoing video ringing → videoAvatarBridge, no PiP, no overlay", () => {
    expect(
      resolveCallPresentationState({
        mode: "video",
        direction: "outgoing",
        phase: "ringing",
        pipShellMounted: true,
        showLocalVideo: true,
        hasMainVideoSlot: true,
        visualTheme: "starbucks",
      })
    ).toMatchObject({
      layout: "videoAvatarBridge",
      shellSurface: "starbucks",
      showAvatarHero: true,
      showMainVideoLayer: false,
      mountMainVideoSlot: true,
      showPipChrome: false,
      showCameraPreparingOverlay: false,
    });
  });

  it("incoming video connecting → avatar bridge, telegram shell", () => {
    expect(
      resolveCallPresentationState({
        mode: "video",
        direction: "incoming",
        phase: "connecting",
        showRemoteVideo: false,
        hasMainVideoSlot: true,
      })
    ).toMatchObject({
      layout: "videoAvatarBridge",
      shellSurface: "telegramSolid",
      showAvatarHero: true,
      showMainVideoLayer: false,
      showPipChrome: false,
      showCameraPreparingOverlay: false,
    });
  });

  it("connected + remote frame → videoConnected, PiP when local ready", () => {
    expect(
      resolveCallPresentationState({
        mode: "video",
        direction: "incoming",
        phase: "connected",
        showRemoteVideo: true,
        showLocalVideo: true,
        hasMainVideoSlot: true,
        visualTheme: "starbucks",
      })
    ).toMatchObject({
      layout: "videoConnected",
      shellSurface: "videoBlack",
      showAvatarHero: false,
      showMainVideoLayer: true,
      showPipChrome: true,
      showCameraPreparingOverlay: false,
    });
  });

  it("connected without remote keeps avatar bridge", () => {
    expect(
      resolveCallPresentationState({
        mode: "video",
        direction: "outgoing",
        phase: "connected",
        showRemoteVideo: false,
        showLocalVideo: true,
        hasMainVideoSlot: true,
      })
    ).toMatchObject({
      layout: "videoAvatarBridge",
      showAvatarHero: false,
      showMainVideoLayer: false,
      showPipChrome: true,
    });
  });

  it("voice connecting uses voiceUnified layout", () => {
    expect(
      resolveCallPresentationState({
        mode: "voice",
        direction: "outgoing",
        phase: "connecting",
        visualTheme: "starbucks",
      })
    ).toMatchObject({
      layout: "voiceUnified",
      shellSurface: "starbucks",
      showAvatarHero: false,
      showPipChrome: false,
    });
  });

  it("incoming voice ringing uses incomingRing layout", () => {
    expect(
      resolveCallPresentationState({
        mode: "voice",
        direction: "incoming",
        phase: "ringing",
      })
    ).toMatchObject({
      layout: "incomingRing",
      shellSurface: "telegramSolid",
    });
  });

  it("terminal phase uses terminal layout", () => {
    expect(
      resolveCallPresentationState({
        mode: "video",
        direction: "incoming",
        phase: "ended",
        hasMainVideoSlot: true,
      })
    ).toMatchObject({
      layout: "terminal",
      showMainVideoLayer: false,
      showPipChrome: false,
      showCameraPreparingOverlay: false,
    });
  });
});
