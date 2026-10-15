import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const plugin = {
  getPermissionState: vi.fn(),
  requestPermission: vi.fn(),
  getRecentPhotos: vi.fn(),
  pickPhotos: vi.fn(),
  resolvePhotos: vi.fn(),
  getSaveCapabilities: vi.fn(),
  saveImages: vi.fn(),
};
const isPluginAvailable = vi.fn((_name: string) => true);

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

  it("save probe (no headers): new binary with getSaveCapabilities → supported", async () => {
    plugin.getSaveCapabilities.mockResolvedValue({ saveImages: true, version: 1 });
    const { probeMessengerNativeImageSaveSupport } = await loadModule();
    expect(await probeMessengerNativeImageSaveSupport()).toBe(true);
  });

  it("save probe (no headers): proxy rejects UNIMPLEMENTED → unsupported, no dead button", async () => {
    plugin.getSaveCapabilities.mockRejectedValue(new Error("UNIMPLEMENTED"));
    const { probeMessengerNativeImageSaveSupport } = await loadModule();
    expect(await probeMessengerNativeImageSaveSupport()).toBe(false);
  });

  it("saveImages maps saved / failed / permission", async () => {
    plugin.saveImages.mockResolvedValue({
      saved: [0, 2],
      failed: [{ index: 1, reason: "download_failed" }],
      permission: "granted",
    });
    const { saveImagesToNativePhotoLibrary } = await loadModule();
    const r = await saveImagesToNativePhotoLibrary(["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"]);
    expect(plugin.saveImages).toHaveBeenCalledWith({ urls: ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"] });
    expect(r).toEqual({ saved: [0, 2], failed: [{ index: 1, reason: "download_failed" }], permission: "granted" });
  });

  it("saveImages bridge failure → every item failed (no silent success)", async () => {
    plugin.saveImages.mockRejectedValue(new Error("boom"));
    const { saveImagesToNativePhotoLibrary } = await loadModule();
    const r = await saveImagesToNativePhotoLibrary(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(r.saved).toEqual([]);
    expect(r.failed.map((f) => f.index)).toEqual([0, 1]);
  });
});

/**
 * Real Capacitor 8 behaviour: raw `Capacitor.nativePromise` for a method missing in the binary never settles
 * (iOS CapacitorBridge.swift logs "No method found" and returns; Android logs InvalidPluginMethodException).
 * Headers are `{ name, methods: [{ name, rtype }] }` injected at document start (JSExport.swift / JSExport.java).
 */
describe("messenger-photo-library: Capacitor 8 header-based save support (D-1)", () => {
  const OLD_METHODS = ["getPermissionState", "requestPermission", "getRecentPhotos", "pickPhotos", "resolvePhotos"];
  const NEW_METHODS = [...OLD_METHODS, "getSaveCapabilities", "saveImages"];

  function installBridge(opts: { headers: unknown; impl?: Record<string, (o: unknown) => Promise<unknown>> }) {
    const nativePromise = vi.fn((_plugin: string, method: string, options?: unknown) => {
      const fn = opts.impl?.[method];
      /** unknown method → never settles (models CapacitorBridge.swift:487-490) */
      return fn ? fn(options) : new Promise<unknown>(() => undefined);
    });
    vi.stubGlobal("window", { Capacitor: { nativePromise, PluginHeaders: opts.headers } });
    return nativePromise;
  }

  function header(methods: string[]) {
    return [{ name: "MessengerPhotoLibrary", methods: methods.map((name) => ({ name, rtype: "promise" })) }];
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(true);
    vi.mocked(native.waitForCapacitorBridgeReady).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("old binary header without saveImages → false synchronously, native never called", async () => {
    const nativePromise = installBridge({ headers: header(OLD_METHODS) });
    const { probeMessengerNativeImageSaveSupport } = await loadModule();
    await expect(probeMessengerNativeImageSaveSupport()).resolves.toBe(false);
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("binary without the plugin header at all → false", async () => {
    installBridge({ headers: [{ name: "App", methods: [] }] });
    const { probeMessengerNativeImageSaveSupport } = await loadModule();
    await expect(probeMessengerNativeImageSaveSupport()).resolves.toBe(false);
  });

  it("new binary header with saveImages → true without a round trip", async () => {
    const nativePromise = installBridge({ headers: header(NEW_METHODS) });
    const { probeMessengerNativeImageSaveSupport } = await loadModule();
    await expect(probeMessengerNativeImageSaveSupport()).resolves.toBe(true);
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("saveImages on an old binary rejects fast (header) → all failed, never hangs", async () => {
    installBridge({ headers: header(OLD_METHODS) });
    const { saveImagesToNativePhotoLibrary } = await loadModule();
    const r = await saveImagesToNativePhotoLibrary(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(r.saved).toEqual([]);
    expect(r.failed.map((f) => f.reason)).toEqual(["bridge_failed", "bridge_failed"]);
  });

  it("headers missing: getSaveCapabilities that never settles → timeout → false (decided, not pending forever)", async () => {
    vi.useFakeTimers();
    const nativePromise = installBridge({ headers: undefined });
    const mod = await loadModule();
    const p = mod.probeMessengerNativeImageSaveSupport();
    await vi.advanceTimersByTimeAsync(mod.MESSENGER_SAVE_CAPABILITIES_TIMEOUT_MS + 10);
    await expect(p).resolves.toBe(false);
    expect(nativePromise).toHaveBeenCalledWith("MessengerPhotoLibrary", "getSaveCapabilities", {});
  });

  it("bridge not ready → false for this call only (not cached); later call re-probes", async () => {
    const native = await import("@/lib/platform/capacitor-native");
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(false);
    vi.mocked(native.waitForCapacitorBridgeReady).mockResolvedValue(false);
    vi.stubGlobal("window", { Capacitor: {} });
    const mod = await loadModule();
    await expect(mod.probeMessengerNativeImageSaveSupport()).resolves.toBe(false);
    /** bridge comes up with headers */
    vi.mocked(native.isCapacitorBridgeReady).mockReturnValue(true);
    installBridge({ headers: header(NEW_METHODS) });
    await expect(mod.probeMessengerNativeImageSaveSupport()).resolves.toBe(true);
  });

  it("saveImages that never settles → timeout → every item failed with reason timeout", async () => {
    vi.useFakeTimers();
    installBridge({ headers: header(NEW_METHODS), impl: { saveImages: () => new Promise(() => undefined) } });
    const mod = await loadModule();
    const p = mod.saveImagesToNativePhotoLibrary(["https://a/1.jpg"]);
    await vi.advanceTimersByTimeAsync(mod.messengerNativeSaveImagesTimeoutMs(1) + 10);
    const r = await p;
    expect(r.saved).toEqual([]);
    expect(r.failed).toEqual([{ index: 0, reason: "timeout" }]);
  });

  it("saveImages success through raw nativePromise when the header lists it", async () => {
    installBridge({
      headers: header(NEW_METHODS),
      impl: { saveImages: async () => ({ saved: [0], failed: [], permission: "granted" }) },
    });
    const { saveImagesToNativePhotoLibrary } = await loadModule();
    await expect(saveImagesToNativePhotoLibrary(["https://a/1.jpg"])).resolves.toEqual({
      saved: [0],
      failed: [],
      permission: "granted",
    });
  });
});
