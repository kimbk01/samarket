import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const permissionMockState = vi.hoisted(() => ({
  completed: new Set<string>(),
}));

function fakeLiveStream(): MediaStream {
  const audio = { kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
  const video = { kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

vi.mock("@/lib/call/permission-manager", () => ({
  acquirePrimedCommunityMessengerStream: vi.fn(() => Promise.resolve(fakeLiveStream())),
  assertCallMediaNotPersistentlyDenied: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/community-messenger/media-preflight", () => ({
  isCommunityMessengerMediaSecureContext: vi.fn(() => true),
  persistDeviceIdsFromMediaStream: vi.fn(),
  refreshPreferredCommunityMessengerDevicesFromEnumerate: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  markPermissionFeatureCompleted: vi.fn((featureKey: string) => {
    permissionMockState.completed.add(featureKey);
  }),
  isPermissionFeatureCompleted: vi.fn((featureKey: string) => permissionMockState.completed.has(featureKey)),
}));

describe("primed device stream idle release", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    permissionMockState.completed.clear();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    } as unknown as Navigator);
    vi.stubGlobal("window", {
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),
      isSecureContext: true,
      location: { hostname: "localhost" },
    });
  });

  afterEach(async () => {
    const { resumePrimedCommunityMessengerDeviceStreamIdleRelease } = await import(
      "@/lib/community-messenger/call-permission"
    );
    resumePrimedCommunityMessengerDeviceStreamIdleRelease(0);
    vi.advanceTimersByTime(5_000);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("stores trusted video mark when browser permissions are already granted", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
      permissions: {
        query: vi.fn(({ name }: { name: PermissionName }) =>
          Promise.resolve({ state: name === "camera" || name === "microphone" ? "granted" : "prompt" })
        ),
      },
    } as unknown as Navigator);
    const {
      hasCommunityMessengerMediaTrustedMark,
      resolveCommunityMessengerCallMediaReady,
    } = await import("@/lib/community-messenger/call-permission");

    await expect(resolveCommunityMessengerCallMediaReady("video")).resolves.toBe(true);
    expect(hasCommunityMessengerMediaTrustedMark("video")).toBe(true);
  });

  it("does not stop tracks while suspended during live call", async () => {
    const {
      peekPrimedCommunityMessengerDeviceStream,
      primeCommunityMessengerDevicePermissionFromUserGesture,
      resumePrimedCommunityMessengerDeviceStreamIdleRelease,
      suspendPrimedCommunityMessengerDeviceStreamIdleRelease,
    } = await import("@/lib/community-messenger/call-permission");

    await primeCommunityMessengerDevicePermissionFromUserGesture("video");
    const stream = peekPrimedCommunityMessengerDeviceStream("video");
    expect(stream).not.toBeNull();
    const videoTrack = stream!.getVideoTracks()[0] as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };

    suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
    vi.advanceTimersByTime(120_000);
    expect(videoTrack.stop).not.toHaveBeenCalled();
    expect(peekPrimedCommunityMessengerDeviceStream("video")).toBe(stream);

    resumePrimedCommunityMessengerDeviceStreamIdleRelease(1_000);
    vi.advanceTimersByTime(1_500);
    expect(videoTrack.stop).toHaveBeenCalled();
  });
});
