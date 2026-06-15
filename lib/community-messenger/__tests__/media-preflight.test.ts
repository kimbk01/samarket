import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  queryCommunityMessengerMediaPermissions: vi.fn(),
}));

const isCallMediaGrantedSyncMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/lib/permissions/dibay-device-permission-store", () => ({
  isCallMediaGrantedSync: isCallMediaGrantedSyncMock,
}));

describe("runCommunityMessengerEntryMediaPreflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCallMediaGrantedSyncMock.mockReturnValue(false);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(() => Promise.resolve([])),
      },
    } as unknown as Navigator);
    vi.stubGlobal("window", { isSecureContext: true, location: { hostname: "localhost" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("refreshes device list when call_media store is granted without GUM", async () => {
    isCallMediaGrantedSyncMock.mockReturnValue(true);

    const { runCommunityMessengerEntryMediaPreflight } = await import(
      "@/lib/community-messenger/media-preflight"
    );
    const result = await runCommunityMessengerEntryMediaPreflight();
    expect(result.ok).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
  });

  it("returns gum_failed when store is not granted and does not request media", async () => {
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
    const result = await runCommunityMessengerEntryMediaPreflight();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("gum_failed");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("returns denied when browser permissions are denied", async () => {
    const { queryCommunityMessengerMediaPermissions } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    vi.mocked(queryCommunityMessengerMediaPermissions).mockResolvedValue({
      microphone: "denied",
      camera: "granted",
    });

    const { runCommunityMessengerEntryMediaPreflight } = await import(
      "@/lib/community-messenger/media-preflight"
    );
    const result = await runCommunityMessengerEntryMediaPreflight();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("denied");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});
