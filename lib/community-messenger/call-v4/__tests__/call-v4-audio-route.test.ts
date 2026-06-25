import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DibayCallAudioRouteResult } from "@/lib/community-messenger/native-call-audio-route.client";

const routeApplyMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const subscribeMock = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({
  speakerEnabled: false,
  setSpeakerEnabled: vi.fn((enabled: boolean) => {
    storeState.speakerEnabled = enabled;
  }),
}));

vi.mock("@/lib/community-messenger/call-audio-route-controller", () => ({
  applyCallAudioRoute: routeApplyMock,
  desiredSpeakerForCallType: (callType: "audio" | "video") => callType === "video",
  releaseNativeCallAudioRoute: releaseMock,
  subscribeNativeCallAudioRouteChanged: subscribeMock,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-media-state", () => ({
  useCallV4MediaStore: {
    getState: () => storeState,
  },
}));

describe("call-v4-audio-route", () => {
  beforeEach(async () => {
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.resetCallV4AudioRouteLifecycleForTests();
    storeState.speakerEnabled = false;
    storeState.setSpeakerEnabled.mockClear();
    routeApplyMock.mockReset();
    releaseMock.mockClear();
    subscribeMock.mockReset();
    subscribeMock.mockReturnValue(() => {});
    routeApplyMock.mockResolvedValue({
      requestedSpeaker: false,
      applied: true,
      actualRoute: "earpiece",
      externalDeviceConnected: false,
      api: "setCommunicationDevice",
      reason: "test",
    });
  });

  it("audio call default routes to earpiece", async () => {
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-audio",
      mediaType: "audio",
      direction: "incoming",
    });
    await Promise.resolve();
    expect(storeState.setSpeakerEnabled).toHaveBeenCalledWith(false);
    expect(routeApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "c-audio",
        callType: "audio",
        desiredSpeaker: false,
      }),
    );
  });

  it("video call default routes to speaker", async () => {
    routeApplyMock.mockResolvedValue({
      requestedSpeaker: true,
      applied: true,
      actualRoute: "speaker",
      externalDeviceConnected: false,
      api: "setCommunicationDevice",
      reason: "test",
    });
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-video",
      mediaType: "video",
      direction: "outgoing",
    });
    await Promise.resolve();
    expect(storeState.setSpeakerEnabled).toHaveBeenCalledWith(true);
    expect(routeApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callType: "video",
        desiredSpeaker: true,
        role: "caller",
      }),
    );
  });

  it("bluetooth disconnect falls back to media default", async () => {
    const holder: { listener?: (result: DibayCallAudioRouteResult) => void } = {};
    subscribeMock.mockImplementation((onChange: (result: DibayCallAudioRouteResult) => void) => {
      holder.listener = onChange;
      return () => {};
    });
    const mod = await import("@/lib/community-messenger/call-v4/call-v4-audio-route");
    mod.ensureCallV4AudioRouteLifecycle({
      callId: "c-video-fallback",
      mediaType: "video",
      direction: "incoming",
    });
    await Promise.resolve();
    holder.listener?.({
        requestedSpeaker: false,
        applied: false,
        actualRoute: "bluetooth",
        externalDeviceConnected: true,
        api: "noop",
        reason: "device_added",
      });
    expect(storeState.speakerEnabled).toBe(false);
    routeApplyMock.mockClear();
    holder.listener?.({
        requestedSpeaker: false,
        applied: true,
        actualRoute: "earpiece",
        externalDeviceConnected: false,
        api: "setCommunicationDevice",
        reason: "device_removed",
      });
    await Promise.resolve();
    expect(routeApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "c-video-fallback",
        desiredSpeaker: true,
        reason: "v4_external_removed_fallback",
      }),
    );
  });
});
