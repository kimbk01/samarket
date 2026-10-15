import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = {
  getPermissionState: vi.fn(),
  requestPermission: vi.fn(),
  getRecentPhotos: vi.fn(),
  pickPhotos: vi.fn(),
  resolvePhotos: vi.fn(),
};
const isPluginAvailable = vi.fn(() => true);

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  isCapacitorBridgeReady: vi.fn(() => true),
  waitForCapacitorBridgeReady: vi.fn(async () => true),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isPluginAvailable: (name: string) => isPluginAvailable(name),
  },
  registerPlugin: vi.fn(() => plugin),
}));

async function loadModule() {
  return import("@/lib/community-messenger/attachment/messenger-photo-library");
}

describe("messenger-photo-library wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    isPluginAvailable.mockReset();
    isPluginAvailable.mockReturnValue(true);
    for (const fn of Object.values(plugin)) fn.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("passes native `failed` rows through from resolvePhotos", async () => {
    plugin.resolvePhotos.mockResolvedValue({
      photos: [{ id: "a", base64: "AA==", mimeType: "image/png", fileName: "recent-0.png" }],
      failed: [{ index: 1, id: "b", reason: "decode_failed" }, { bogus: true }, null],
    });
    const { resolvePhotos } = await loadModule();
    const result = await resolvePhotos(["a", "b"]);
    expect(plugin.resolvePhotos).toHaveBeenCalledWith({ ids: ["a", "b"] });
    expect(result.photos).toHaveLength(1);
    expect(result.photos[0]?.mimeType).toBe("image/png");
    expect(result.failed).toEqual([
      { index: 1, id: "b", reason: "decode_failed" },
      { index: -1, reason: "unknown" },
    ]);
  });

  it("treats a missing `failed` field (old binary) as no failures", async () => {
    plugin.resolvePhotos.mockResolvedValue({ photos: [{ base64: "AA==" }] });
    const { resolvePhotos } = await loadModule();
    const result = await resolvePhotos(["a"]);
    expect(result).toEqual({ photos: [{ base64: "AA==" }], failed: [] });
  });

  it("surfaces pickPhotos failures even when every selected photo failed", async () => {
    plugin.pickPhotos.mockResolvedValue({
      photos: [],
      failed: [{ index: 0, reason: "out_of_memory" }],
      cancelled: false,
    });
    const { pickPhotos } = await loadModule();
    const result = await pickPhotos(10);
    expect(result.photos).toEqual([]);
    expect(result.failed).toEqual([{ index: 0, reason: "out_of_memory" }]);
  });

  it("returns empty result on user cancel", async () => {
    plugin.pickPhotos.mockResolvedValue({ photos: [], cancelled: true });
    const { pickPhotos } = await loadModule();
    expect(await pickPhotos(10)).toEqual({ photos: [], failed: [] });
  });

  it("returns empty result when the native call rejects", async () => {
    plugin.resolvePhotos.mockRejectedValue(new Error("UNIMPLEMENTED"));
    const { resolvePhotos } = await loadModule();
    expect(await resolvePhotos(["a"])).toEqual({ photos: [], failed: [] });
  });

  it("reports native availability only when the plugin is registered in the binary", async () => {
    const { isMessengerPhotoLibraryNativeAvailable } = await loadModule();
    isPluginAvailable.mockReturnValue(true);
    expect(isMessengerPhotoLibraryNativeAvailable()).toBe(true);
    expect(isPluginAvailable).toHaveBeenCalledWith("MessengerPhotoLibrary");

    // Old binary without MessengerPhotoLibrary → web <input> fallback.
    isPluginAvailable.mockReturnValue(false);
    expect(isMessengerPhotoLibraryNativeAvailable()).toBe(false);
  });

  it("is unavailable when the bridge is not ready even if the plugin header exists", async () => {
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(false);
    const { isMessengerPhotoLibraryNativeAvailable } = await loadModule();
    expect(isMessengerPhotoLibraryNativeAvailable()).toBe(false);
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(true);
  });
});
