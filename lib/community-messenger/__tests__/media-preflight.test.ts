import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  queryCommunityMessengerMediaPermissions: vi.fn(),
}));

const storePrimedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/community-messenger/call-permission", () => ({
  markCommunityMessengerMediaTrustedOnce: vi.fn(),
  storePrimedCommunityMessengerDeviceStream: storePrimedMock,
}));

vi.mock("@/lib/community-messenger/call-media-onboarding-storage", () => ({
  readDiBaYCallMediaPromptState: vi.fn(() => null),
}));

function fakePreflightStream(): MediaStream {
  const audio = {
    kind: "audio",
    readyState: "live",
    stop: vi.fn(),
    getSettings: () => ({}),
  } as unknown as MediaStreamTrack;
  const video = {
    kind: "video",
    readyState: "live",
    stop: vi.fn(),
    getSettings: () => ({}),
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  acquireVideoCallStreamWithDiBaYGate: vi.fn(() => Promise.resolve(fakePreflightStream())),
}));

describe("runCommunityMessengerEntryMediaPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn() },
    } as unknown as Navigator);
    vi.stubGlobal("window", { isSecureContext: true, location: { hostname: "localhost" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses silent video acquire when mic and cam are already granted", async () => {
    const { queryCommunityMessengerMediaPermissions } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    const { acquireVideoCallStreamWithDiBaYGate } = await import(
      "@/lib/permissions/device-permission-manager"
    );
    vi.mocked(queryCommunityMessengerMediaPermissions).mockResolvedValue({
      microphone: "granted",
      camera: "granted",
    });

    const { runCommunityMessengerEntryMediaPreflight } = await import(
      "@/lib/community-messenger/media-preflight"
    );
    const result = await runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: false });
    expect(result.ok).toBe(true);
    expect(acquireVideoCallStreamWithDiBaYGate).toHaveBeenCalledWith({ explicitRetry: false });
  });

  it("requires gesture path when permissions are not granted", async () => {
    const { queryCommunityMessengerMediaPermissions } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    vi.mocked(queryCommunityMessengerMediaPermissions).mockResolvedValue({
      microphone: "prompt",
      camera: "prompt",
    });

    const { runCommunityMessengerEntryMediaPreflight } = await import(
      "@/lib/community-messenger/media-preflight"
    );
    const silent = await runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: false });
    expect(silent.ok).toBe(false);
    if (!silent.ok) expect(silent.code).toBe("gum_failed");

    const { acquireVideoCallStreamWithDiBaYGate } = await import(
      "@/lib/permissions/device-permission-manager"
    );
    const gesture = await runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: true });
    expect(gesture.ok).toBe(true);
    expect(acquireVideoCallStreamWithDiBaYGate).toHaveBeenCalledWith({ explicitRetry: true });
    expect(storePrimedMock).toHaveBeenCalled();
  });

  it("skips gesture GUM when call media onboarding was already accepted", async () => {
    const { readDiBaYCallMediaPromptState } = await import(
      "@/lib/community-messenger/call-media-onboarding-storage"
    );
    const { queryCommunityMessengerMediaPermissions } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    const { acquireVideoCallStreamWithDiBaYGate } = await import(
      "@/lib/permissions/device-permission-manager"
    );
    vi.mocked(readDiBaYCallMediaPromptState).mockReturnValue("accepted");
    vi.mocked(queryCommunityMessengerMediaPermissions).mockResolvedValue({
      microphone: "prompt",
      camera: "prompt",
    });

    const { runCommunityMessengerEntryMediaPreflight } = await import(
      "@/lib/community-messenger/media-preflight"
    );
    const gesture = await runCommunityMessengerEntryMediaPreflight({ allowPermissionPrompt: true });
    expect(gesture.ok).toBe(false);
    if (!gesture.ok) expect(gesture.code).toBe("gum_failed");
    expect(acquireVideoCallStreamWithDiBaYGate).not.toHaveBeenCalled();
  });
});
