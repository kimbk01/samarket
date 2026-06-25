import { beforeEach, describe, expect, it, vi } from "vitest";

const applyCallAudioRouteMock = vi.hoisted(() => vi.fn());
const releaseNativeCallAudioRouteMock = vi.hoisted(() => vi.fn(async () => {}));
const storeState = vi.hoisted(() => ({
  speakerEnabled: false,
  setSpeakerEnabled: vi.fn((enabled: boolean) => {
    storeState.speakerEnabled = enabled;
  }),
}));

vi.mock("@/lib/community-messenger/call-audio-route-controller", () => ({
  applyCallAudioRoute: applyCallAudioRouteMock,
  releaseNativeCallAudioRoute: releaseNativeCallAudioRouteMock,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-media-state", () => ({
  useCallV4MediaStore: {
    getState: () => storeState,
  },
}));

import {
  defaultSpeakerForCallV4MediaType,
  ensureCallV4AudioRouteAfterConnectedGate,
  releaseCallV4AudioRoute,
  resetCallV4AudioRouteLifecycleForTests,
  toggleCallV4SpeakerRoute,
} from "@/lib/community-messenger/call-v4/call-v4-audio-route";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function seedConnectedVoice(callId: string, connectedAt: number | null): void {
  useCallV4Store.setState({
    phase: connectedAt == null ? "joining" : "connected",
    connectedAt,
    identity: {
      callId,
      roomId: "room-1",
      callerUserId: "a",
      calleeUserId: "b",
      direction: "incoming",
      mediaType: "audio",
      createdAt: new Date().toISOString(),
    },
  });
}

describe("call-v4-audio-route speaker-only", () => {
  beforeEach(() => {
    resetCallV4AudioRouteLifecycleForTests();
    useCallV4Store.getState().resetToIdle();
    storeState.speakerEnabled = false;
    storeState.setSpeakerEnabled.mockClear();
    applyCallAudioRouteMock.mockReset();
    applyCallAudioRouteMock.mockResolvedValue({
      requestedSpeaker: false,
      applied: true,
      actualRoute: "earpiece",
      externalDeviceConnected: false,
      api: "setCommunicationDevice",
      reason: "test",
    });
    releaseNativeCallAudioRouteMock.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("does not apply before connected_gate_pass (connectedAt null)", () => {
    seedConnectedVoice("call-pre", null);

    ensureCallV4AudioRouteAfterConnectedGate({
      callId: "call-pre",
      mediaType: "audio",
      direction: "incoming",
      connectedAt: null,
    });

    expect(applyCallAudioRouteMock).not.toHaveBeenCalled();
  });

  it("applies earpiece default for voice after connected gate pass", async () => {
    seedConnectedVoice("call-voice", Date.now());

    ensureCallV4AudioRouteAfterConnectedGate({
      callId: "call-voice",
      mediaType: "audio",
      direction: "incoming",
      connectedAt: Date.now(),
    });

    await vi.waitFor(() => {
      expect(applyCallAudioRouteMock).toHaveBeenCalledTimes(1);
    });

    expect(applyCallAudioRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-voice",
        callType: "audio",
        desiredSpeaker: false,
        reason: "v4_connected_gate_pass",
      }),
    );
    expect(storeState.speakerEnabled).toBe(false);
  });

  it("applies speaker default for video after connected gate pass", async () => {
    useCallV4Store.setState({
      phase: "connected",
      connectedAt: Date.now(),
      identity: {
        callId: "call-video",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "video",
        createdAt: new Date().toISOString(),
      },
    });

    ensureCallV4AudioRouteAfterConnectedGate({
      callId: "call-video",
      mediaType: "video",
      direction: "outgoing",
      connectedAt: Date.now(),
    });

    await vi.waitFor(() => {
      expect(applyCallAudioRouteMock).toHaveBeenCalledTimes(1);
    });

    expect(applyCallAudioRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-video",
        callType: "video",
        desiredSpeaker: true,
        reason: "v4_connected_gate_pass",
      }),
    );
    expect(storeState.speakerEnabled).toBe(true);
  });

  it("toggles speaker only when connected and route was applied", async () => {
    seedConnectedVoice("call-toggle", Date.now());

    ensureCallV4AudioRouteAfterConnectedGate({
      callId: "call-toggle",
      mediaType: "audio",
      direction: "incoming",
      connectedAt: Date.now(),
    });
    await vi.waitFor(() => expect(applyCallAudioRouteMock).toHaveBeenCalledTimes(1));
    applyCallAudioRouteMock.mockClear();

    storeState.speakerEnabled = false;
    await toggleCallV4SpeakerRoute("call-toggle");

    expect(applyCallAudioRouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "call-toggle",
        desiredSpeaker: true,
        reason: "v4_speaker_toggle",
      }),
    );
  });

  it("does not toggle before route apply", async () => {
    seedConnectedVoice("call-no-toggle", Date.now());
    await toggleCallV4SpeakerRoute("call-no-toggle");
    expect(applyCallAudioRouteMock).not.toHaveBeenCalled();
  });

  it("releases native route on cleanup", async () => {
    seedConnectedVoice("call-release", Date.now());
    ensureCallV4AudioRouteAfterConnectedGate({
      callId: "call-release",
      mediaType: "audio",
      direction: "incoming",
      connectedAt: Date.now(),
    });
    await releaseCallV4AudioRoute("call-release", "v4_cleanup");
    expect(releaseNativeCallAudioRouteMock).toHaveBeenCalledWith("v4_cleanup");
  });

  it("maps media type to default speaker policy", () => {
    expect(defaultSpeakerForCallV4MediaType("audio")).toBe(false);
    expect(defaultSpeakerForCallV4MediaType("video")).toBe(true);
  });
});
