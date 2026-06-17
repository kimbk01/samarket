import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const applyAgoraRemoteSpeakerPreferenceMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const setNativeCallSpeakerphoneEnabledMock = vi.hoisted(() => vi.fn());
const getNativeCallAudioRouteMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-provider/agora-playback-routing", () => ({
  applyAgoraRemoteSpeakerPreference: applyAgoraRemoteSpeakerPreferenceMock,
}));

vi.mock("@/lib/community-messenger/native-call-audio-route.client", () => ({
  getNativeCallAudioRoute: getNativeCallAudioRouteMock,
  releaseNativeCallAudioRoute: vi.fn(),
  setNativeCallSpeakerphoneEnabled: setNativeCallSpeakerphoneEnabledMock,
  subscribeNativeCallAudioRouteChanged: vi.fn(() => () => {}),
}));

function routeResult(input: {
  requestedSpeaker: boolean;
  actualRoute: "speaker" | "earpiece" | "wired" | "bluetooth" | "unknown";
  applied?: boolean;
  externalDeviceConnected?: boolean;
  api?: "setCommunicationDevice" | "setSpeakerphoneOn" | "agora" | "noop";
  reason?: string;
}) {
  return {
    requestedSpeaker: input.requestedSpeaker,
    applied: input.applied ?? true,
    actualRoute: input.actualRoute,
    externalDeviceConnected: input.externalDeviceConnected ?? false,
    api: input.api ?? "setCommunicationDevice",
    reason: input.reason ?? "test",
  };
}

describe("call-audio-route-controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    applyAgoraRemoteSpeakerPreferenceMock.mockClear();
    setNativeCallSpeakerphoneEnabledMock.mockReset();
    getNativeCallAudioRouteMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses speaker ON as the default video call policy", async () => {
    const { desiredSpeakerForCallType } = await import(
      "@/lib/community-messenger/call-audio-route-controller"
    );
    expect(desiredSpeakerForCallType("video")).toBe(true);
  });

  it("uses speaker OFF as the default audio call policy", async () => {
    const { desiredSpeakerForCallType } = await import(
      "@/lib/community-messenger/call-audio-route-controller"
    );
    expect(desiredSpeakerForCallType("audio")).toBe(false);
  });

  it("applies user speaker toggle ON through native route result", async () => {
    setNativeCallSpeakerphoneEnabledMock.mockResolvedValueOnce(
      routeResult({ requestedSpeaker: true, actualRoute: "speaker" })
    );
    getNativeCallAudioRouteMock.mockResolvedValue(
      routeResult({ requestedSpeaker: true, actualRoute: "speaker" })
    );
    const { applyCallAudioRoute } = await import(
      "@/lib/community-messenger/call-audio-route-controller"
    );

    const promise = applyCallAudioRoute({
      callId: "c1",
      callType: "audio",
      role: "caller",
      desiredSpeaker: true,
      reason: "speaker_toggle",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(setNativeCallSpeakerphoneEnabledMock).toHaveBeenCalledWith(true, "speaker_toggle");
    expect(result.actualRoute).toBe("speaker");
  });

  it("does not force speaker when wired or bluetooth is connected", async () => {
    setNativeCallSpeakerphoneEnabledMock.mockResolvedValueOnce(
      routeResult({
        requestedSpeaker: true,
        actualRoute: "bluetooth",
        applied: false,
        externalDeviceConnected: true,
        api: "noop",
      })
    );
    getNativeCallAudioRouteMock.mockResolvedValue(
      routeResult({
        requestedSpeaker: true,
        actualRoute: "bluetooth",
        applied: false,
        externalDeviceConnected: true,
        api: "noop",
      })
    );
    const { applyCallAudioRoute } = await import(
      "@/lib/community-messenger/call-audio-route-controller"
    );

    const promise = applyCallAudioRoute({
      callId: "c2",
      callType: "video",
      role: "callee",
      desiredSpeaker: true,
      reason: "agora_join_success",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(setNativeCallSpeakerphoneEnabledMock).toHaveBeenCalledTimes(1);
    expect(result.externalDeviceConnected).toBe(true);
    expect(result.actualRoute).toBe("bluetooth");
  });

  it("retries when video route falls back to earpiece after join", async () => {
    setNativeCallSpeakerphoneEnabledMock
      .mockResolvedValueOnce(routeResult({ requestedSpeaker: true, actualRoute: "earpiece" }))
      .mockResolvedValueOnce(routeResult({ requestedSpeaker: true, actualRoute: "speaker" }));
    getNativeCallAudioRouteMock
      .mockResolvedValueOnce(routeResult({ requestedSpeaker: true, actualRoute: "earpiece" }))
      .mockResolvedValue(routeResult({ requestedSpeaker: true, actualRoute: "speaker" }));
    const { applyCallAudioRoute } = await import(
      "@/lib/community-messenger/call-audio-route-controller"
    );

    const promise = applyCallAudioRoute({
      callId: "c3",
      callType: "video",
      role: "callee",
      desiredSpeaker: true,
      reason: "agora_join_success",
    });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(setNativeCallSpeakerphoneEnabledMock).toHaveBeenCalledTimes(2);
    expect(setNativeCallSpeakerphoneEnabledMock).toHaveBeenLastCalledWith(
      true,
      "agora_join_success:verify_300"
    );
    expect(result.actualRoute).toBe("speaker");
  });
});
