import { beforeEach, describe, expect, it, vi } from "vitest";

const permissionState = vi.hoisted(() => ({
  camera: "granted" as PermissionState | null,
  microphone: "granted" as PermissionState | null,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  queryCommunityMessengerMediaPermissions: vi.fn(() =>
    Promise.resolve({
      camera: permissionState.camera,
      microphone: permissionState.microphone,
    })
  ),
}));

vi.mock("@/lib/permissions/native-device-permissions-plugin", () => ({
  checkAndroidNativeDevicePermission: vi.fn(() => Promise.resolve(null)),
  openAndroidNativeAppSettings: vi.fn(() => Promise.resolve(false)),
  requestAndroidNativeDevicePermission: vi.fn(() => Promise.resolve(null)),
  shouldUseAndroidNativeDevicePermissionBridge: vi.fn(() => false),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  setCachedPermissionState: vi.fn(),
}));

describe("call-media-permission-preflight", () => {
  beforeEach(() => {
    vi.resetModules();
    permissionState.camera = "granted";
    permissionState.microphone = "granted";
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      navigator: { userAgent: "test" },
      location: { origin: "https://example.test" },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "device-1" });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });
  });

  it("allows video when camera and microphone are granted without requesting media", async () => {
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("video");
    expect(result.ok).toBe(true);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("blocks voice before media creation when microphone is denied", async () => {
    permissionState.microphone = "denied";
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("voice");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permission_denied");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("blocks video when camera is still unknown", async () => {
    permissionState.camera = null;
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const result = await ensureCallCanUseMedia("video");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permission_unknown");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("single-flights concurrent permission checks", async () => {
    const { queryCommunityMessengerMediaPermissions } = await import(
      "@/lib/community-messenger/media-permissions-query"
    );
    vi.mocked(queryCommunityMessengerMediaPermissions).mockClear();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(queryCommunityMessengerMediaPermissions).mockImplementationOnce(async () => {
      await gate;
      return { camera: "granted", microphone: "granted" };
    });
    const { ensureCallCanUseMedia } = await import("@/lib/community-messenger/call-media-permission-preflight");
    const voice = ensureCallCanUseMedia("voice");
    const video = ensureCallCanUseMedia("video");
    release();
    await Promise.all([voice, video]);
    expect(queryCommunityMessengerMediaPermissions).toHaveBeenCalledTimes(1);
  });
});
