import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const permissionMockState = vi.hoisted(() => ({
  completed: new Set<string>(),
  primedKind: null as string | null,
  streamTracks: { audio: true, video: true },
}));

function fakeLiveStream(opts?: { video?: boolean }): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  if (opts?.video !== false) {
    tracks.push({ kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack);
  }
  tracks.push({ kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack);
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  } as unknown as MediaStream;
}

vi.mock("@/lib/call/permission-manager", () => ({
  acquirePrimedCommunityMessengerStream: vi.fn(() => Promise.resolve(fakeLiveStream())),
  assertCallMediaNotPersistentlyDenied: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  acquireVideoCallStreamWithDiBaYGate: vi.fn(() => Promise.resolve(fakeLiveStream())),
  isPermissionFeatureCompleted: vi.fn((key: string) => permissionMockState.completed.has(key)),
  markPermissionFeatureCompleted: vi.fn((key: string) => {
    permissionMockState.completed.add(key);
  }),
}));

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  isCommunityMessengerMediaBrowserGrantedSync: vi.fn(() => false),
  queryCommunityMessengerMediaPermissions: vi.fn(),
}));

vi.mock("@/lib/community-messenger/media-preflight", () => ({
  isCommunityMessengerMediaSecureContext: vi.fn(() => true),
  persistDeviceIdsFromMediaStream: vi.fn(),
  refreshPreferredCommunityMessengerDevicesFromEnumerate: vi.fn(() => Promise.resolve()),
}));

describe("call-media-bootstrap", () => {
  beforeEach(() => {
    permissionMockState.completed.clear();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    } as unknown as Navigator);
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("marks voice and video trusted after video prime", async () => {
    const { primeVideoCallMediaFromUserGesture, isVideoCallMediaReady } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeVideoCallMediaFromUserGesture();
    expect(result.ok).toBe(true);
    expect(isVideoCallMediaReady()).toBe(true);
    expect(permissionMockState.completed.has("messenger_video_call")).toBe(true);
    expect(permissionMockState.completed.has("messenger_voice_call")).toBe(true);
  });

  it("rejects video prime when stream has no live video track", async () => {
    const { acquirePrimedCommunityMessengerStream } = await import("@/lib/call/permission-manager");
    vi.mocked(acquirePrimedCommunityMessengerStream).mockResolvedValueOnce(
      fakeLiveStream({ video: false })
    );
    const { primeVideoCallMediaFromUserGesture } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const result = await primeVideoCallMediaFromUserGesture();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("failed");
  });

  it("clears voice-only primed stream when priming video", async () => {
    const { primeVoiceCallMediaFromUserGesture, primeVideoCallMediaFromUserGesture } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    const {
      hasUsablePrimedCommunityMessengerDeviceStream,
      resumePrimedCommunityMessengerDeviceStreamIdleRelease,
    } = await import("@/lib/community-messenger/call-permission");

    await primeVoiceCallMediaFromUserGesture();
    expect(hasUsablePrimedCommunityMessengerDeviceStream("voice")).toBe(true);

    await primeVideoCallMediaFromUserGesture();
    expect(hasUsablePrimedCommunityMessengerDeviceStream("voice")).toBe(false);
    expect(hasUsablePrimedCommunityMessengerDeviceStream("video")).toBe(true);

    resumePrimedCommunityMessengerDeviceStreamIdleRelease(0);
  });

  it("treats browser-granted cache as video-ready", async () => {
    const { isCommunityMessengerMediaBrowserGrantedSync } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    vi.mocked(isCommunityMessengerMediaBrowserGrantedSync).mockReturnValue(true);

    const { isVideoCallMediaReady } = await import("@/lib/community-messenger/call-media-bootstrap");
    expect(isVideoCallMediaReady()).toBe(true);
  });

  it("uses explicitRetry for outgoing video navigate prime", async () => {
    const { acquireVideoCallStreamWithDiBaYGate } = await import(
      "@/lib/permissions/device-permission-manager"
    );
    const { primeOutgoingCallMediaBeforeNavigate } = await import(
      "@/lib/community-messenger/call-media-bootstrap"
    );
    await primeOutgoingCallMediaBeforeNavigate("video");
    expect(acquireVideoCallStreamWithDiBaYGate).toHaveBeenCalledWith({ explicitRetry: true });
  });
});
