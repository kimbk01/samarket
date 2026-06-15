import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaPermissionState = vi.hoisted(() => ({
  camera: null as PermissionState | null,
  microphone: null as PermissionState | null,
}));

const nativePermissionMock = vi.hoisted(() => ({
  request: vi.fn(() => Promise.resolve(null)),
  check: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/community-messenger/media-permissions-query", () => ({
  queryCommunityMessengerMediaPermissions: vi.fn(() =>
    Promise.resolve({
      camera: mediaPermissionState.camera,
      microphone: mediaPermissionState.microphone,
    })
  ),
}));

vi.mock("@/lib/permissions/native-device-permissions-plugin", () => ({
  checkAndroidNativeDevicePermission: nativePermissionMock.check,
  openAndroidNativeAppSettings: vi.fn(() => Promise.resolve(false)),
  requestAndroidNativeDevicePermission: nativePermissionMock.request,
  shouldUseAndroidNativeDevicePermissionBridge: vi.fn(() => false),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  setCachedPermissionState: vi.fn(),
}));

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      map.delete(key);
    }),
  };
}

function fakeStream(): MediaStream {
  const audio = {
    kind: "audio",
    stop: vi.fn(),
    getSettings: () => ({ deviceId: "mic-1" }),
  } as unknown as MediaStreamTrack;
  const video = {
    kind: "video",
    stop: vi.fn(),
    getSettings: () => ({ deviceId: "cam-1" }),
  } as unknown as MediaStreamTrack;
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

describe("dibay-device-permission-store", () => {
  beforeEach(() => {
    vi.resetModules();
    nativePermissionMock.check.mockResolvedValue(null);
    nativePermissionMock.request.mockResolvedValue(null);
    mediaPermissionState.camera = null;
    mediaPermissionState.microphone = null;
    const storage = createStorage();
    vi.stubGlobal("window", {
      localStorage: storage,
      navigator: { userAgent: "test" },
      location: { origin: "https://example.test" },
      open: vi.fn(),
    });
    vi.stubGlobal("crypto", { randomUUID: () => "device-1" });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(fakeStream())),
        enumerateDevices: vi.fn(() => Promise.resolve([])),
      },
    });
  });

  it("requests camera and microphone once from initial onboarding and persists granted state", async () => {
    const { requestInitialDevicePermissions, getDibayDevicePermissionState } = await import(
      "@/lib/permissions/dibay-device-permission-store"
    );
    const state = await requestInitialDevicePermissions("first_login");
    expect(state.camera).toBe("granted");
    expect(state.microphone).toBe("granted");
    expect(state.requestedAt).toEqual(expect.any(Number));
    expect(state.grantedAt).toEqual(expect.any(Number));
    expect(state.source).toBe("first_login");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
    expect(getDibayDevicePermissionState().camera).toBe("granted");
  });

  it("checkDevicePermissions never requests media", async () => {
    mediaPermissionState.camera = "granted";
    mediaPermissionState.microphone = "granted";
    const { checkDevicePermissions } = await import("@/lib/permissions/dibay-device-permission-store");
    const state = await checkDevicePermissions();
    expect(state.camera).toBe("granted");
    expect(state.microphone).toBe("granted");
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("treats prompt as denied after initial onboarding was requested", async () => {
    const { requestInitialDevicePermissions, checkDevicePermissions } = await import(
      "@/lib/permissions/dibay-device-permission-store"
    );
    await requestInitialDevicePermissions("app_entry");
    mediaPermissionState.camera = "prompt";
    mediaPermissionState.microphone = "prompt";
    const state = await checkDevicePermissions();
    expect(state.camera).toBe("denied");
    expect(state.microphone).toBe("denied");
  });
});
