import { beforeEach, describe, expect, it, vi } from "vitest";

const nativeBridge = vi.hoisted(() => ({
  shouldUseAndroid: true,
  checkMic: "granted" as "granted" | "denied" | "prompt" | null,
  checkCam: "granted" as "granted" | "denied" | "prompt" | null,
  requestCallMedia: "granted" as "granted" | "denied" | "prompt" | null,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  queryCommunityMessengerMediaPermissions: vi.fn(() =>
    Promise.resolve({
      camera: "prompt" as PermissionState | null,
      microphone: "prompt" as PermissionState | null,
    }),
  ),
}));

vi.mock("@/lib/permissions/native-device-permissions-plugin", () => ({
  shouldUseAndroidNativeDevicePermissionBridge: () => nativeBridge.shouldUseAndroid,
  checkAndroidNativeDevicePermission: vi.fn(async (kind: "camera" | "microphone") => {
    if (kind === "microphone") return nativeBridge.checkMic;
    return nativeBridge.checkCam;
  }),
  requestAndroidNativeCallMediaPermissions: vi.fn(async () => nativeBridge.requestCallMedia),
  openAndroidNativeAppSettings: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  setCachedPermissionState: vi.fn(),
  markPermissionFeatureCompleted: vi.fn(),
}));

describe("ensureOutgoingCallMediaPermission (Android)", () => {
  beforeEach(() => {
    vi.resetModules();
    nativeBridge.shouldUseAndroid = true;
    nativeBridge.checkMic = "granted";
    nativeBridge.checkCam = "granted";
    nativeBridge.requestCallMedia = "granted";
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() =>
          JSON.stringify({
            v: 1,
            camera: "unknown",
            microphone: "unknown",
            requestedAt: Date.now(),
            grantedAt: null,
            source: "app_entry",
          }),
        ),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      navigator: { userAgent: "android" },
      location: { origin: "https://example.test" },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "device-android-1" });
  });

  it("allows video when OS grants mic+camera even if store still unknown", async () => {
    const { ensureOutgoingCallMediaPermission } = await import(
      "@/lib/community-messenger/call-media-permission-preflight"
    );
    const result = await ensureOutgoingCallMediaPermission("video");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.microphone).toBe("granted");
      expect(result.state.camera).toBe("granted");
    }
  });

  it("requests OS permissions when native runtime is not granted yet", async () => {
    nativeBridge.checkMic = "prompt";
    nativeBridge.checkCam = "prompt";
    nativeBridge.requestCallMedia = "granted";
    const { requestAndroidNativeCallMediaPermissions } = await import(
      "@/lib/permissions/native-device-permissions-plugin"
    );
    const { ensureOutgoingCallMediaPermission } = await import(
      "@/lib/community-messenger/call-media-permission-preflight"
    );
    const result = await ensureOutgoingCallMediaPermission("video");
    expect(requestAndroidNativeCallMediaPermissions).toHaveBeenCalledWith("video");
    expect(result.ok).toBe(true);
  });
});
