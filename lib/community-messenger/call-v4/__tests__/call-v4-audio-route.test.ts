import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DibayCallAudioRouteResult } from "@/lib/community-messenger/native-call-audio-route.client";

const setNativeRouteMock = vi.hoisted(() => vi.fn());
const getNativeRouteMock = vi.hoisted(() => vi.fn());
const releaseNativeRouteMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const subscribeNativeRouteMock = vi.hoisted(() => vi.fn());
const applyAgoraRemoteSpeakerPreferenceMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const storeState = vi.hoisted(() => ({
  speakerEnabled: false,
  setSpeakerEnabled: vi.fn((enabled: boolean) => {
    storeState.speakerEnabled = enabled;
  }),
}));

vi.mock("@/lib/community-messenger/call-provider/agora-playback-routing", () => ({
  applyAgoraRemoteSpeakerPreference: applyAgoraRemoteSpeakerPreferenceMock,
}));

vi.mock("@/lib/community-messenger/native-call-audio-route.client", () => ({
  getNativeCallAudioRoute: getNativeRouteMock,
  setNativeCallSpeakerphoneEnabled: setNativeRouteMock,
  releaseNativeCallAudioRoute: releaseNativeRouteMock,
  subscribeNativeCallAudioRouteChanged: subscribeNativeRouteMock,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-media-state", () => ({
  useCallV4MediaStore: {
    getState: () => storeState,
  },
}));

function routeResult(
  requestedSpeaker: boolean,
  actualRoute: DibayCallAudioRouteResult["actualRoute"],
  externalDeviceConnected = false,
  reason = "test",
): DibayCallAudioRouteResult {
  return {
    requestedSpeaker,
    applied: true,
    actualRoute,
    externalDeviceConnected,
    api: "setCommunicationDevice",
    reason,
  };
}

describe("call-v4-audio-route", () => {
  beforeEach(async () => {
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.resetCallV4AudioRouteLifecycleForTests();
    storeState.speakerEnabled = false;
    storeState.setSpeakerEnabled.mockClear();
    setNativeRouteMock.mockReset();
    getNativeRouteMock.mockReset();
    releaseNativeRouteMock.mockClear();
    subscribeNativeRouteMock.mockReset();
    applyAgoraRemoteSpeakerPreferenceMock.mockClear();

    setNativeRouteMock.mockImplementation(async (enabled: boolean, reason: string) =>
      routeResult(enabled, enabled ? "speaker" : "earpiece", false, reason),
    );
    getNativeRouteMock.mockImplementation(async () => routeResult(false, "earpiece"));
    subscribeNativeRouteMock.mockReturnValue(() => {});
  });

  it("audio call default routes to earpiece", async () => {
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-audio",
      mediaType: "audio",
      direction: "incoming",
    });
    await vi.waitFor(() => {
      expect(setNativeRouteMock).toHaveBeenCalledTimes(1);
    });
    expect(storeState.setSpeakerEnabled).toHaveBeenCalledWith(false);
    expect(setNativeRouteMock).toHaveBeenCalledWith(false, "v4_session_start");
  });

  it("video call default routes to speaker", async () => {
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-video",
      mediaType: "video",
      direction: "outgoing",
    });
    await vi.waitFor(() => {
      expect(setNativeRouteMock).toHaveBeenCalledTimes(1);
    });
    expect(storeState.setSpeakerEnabled).toHaveBeenCalledWith(true);
    expect(setNativeRouteMock).toHaveBeenCalledWith(true, "v4_session_start");
  });

  it("bluetooth disconnect falls back to media default", async () => {
    const holder: { listener?: (result: DibayCallAudioRouteResult) => void } = {};
    subscribeNativeRouteMock.mockImplementation((onChange: (result: DibayCallAudioRouteResult) => void) => {
      holder.listener = onChange;
      return () => {};
    });
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-video-fallback",
      mediaType: "video",
      direction: "incoming",
    });
    await vi.waitFor(() => {
      expect(setNativeRouteMock).toHaveBeenCalledTimes(1);
      expect(holder.listener).toBeTypeOf("function");
    });
    holder.listener?.({
        requestedSpeaker: false,
        applied: false,
        actualRoute: "bluetooth",
        externalDeviceConnected: true,
        api: "noop",
        reason: "device_added",
      });
    expect(storeState.speakerEnabled).toBe(false);
    setNativeRouteMock.mockClear();
    holder.listener?.({
        requestedSpeaker: false,
        applied: true,
        actualRoute: "earpiece",
        externalDeviceConnected: false,
        api: "setCommunicationDevice",
        reason: "device_removed",
      });
    await vi.waitFor(() => {
      expect(setNativeRouteMock).toHaveBeenCalledTimes(1);
    });
    expect(setNativeRouteMock).toHaveBeenCalledWith(true, "v4_external_removed_fallback");
  });
});
