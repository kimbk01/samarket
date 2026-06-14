import { describe, expect, it, vi, beforeEach } from "vitest";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
  resolveCapacitorShellPlatform: vi.fn(() => null),
  isCapacitorBridgeReady: vi.fn(() => false),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: vi.fn(() => ({
    checkPermission: vi.fn(),
    requestPermission: vi.fn(),
    openAppSettings: vi.fn(),
  })),
}));

describe("android-native-device-permissions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("skips native bridge on web", async () => {
    const { ensureAndroidNativeRuntimePermission } = await import("@/lib/permissions/android-native-device-permissions");
    await expect(ensureAndroidNativeRuntimePermission("microphone")).resolves.toBe("skipped");
  });

  it("requests native call media permissions on android shell", async () => {
    const cap = await import("@/lib/platform/capacitor-native");
    vi.mocked(cap.isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(cap.resolveCapacitorShellPlatform).mockReturnValue("android");
    vi.mocked(cap.isCapacitorBridgeReady).mockReturnValue(true);

    vi.stubGlobal("window", {
      Capacitor: {
        nativePromise: vi.fn(async (_plugin: string, method: string) => {
          if (method === "checkPermission") return { kind: "microphone", state: "prompt" };
          if (method === "requestCallMediaPermissions") return { callKind: "voice", state: "granted" };
          return {};
        }),
      },
    });

    const { ensureAndroidNativeCallMediaPermissions } = await import("@/lib/permissions/android-native-device-permissions");
    await expect(ensureAndroidNativeCallMediaPermissions("voice" satisfies CommunityMessengerCallKind)).resolves.toBe("granted");
    vi.unstubAllGlobals();
  });
});

describe("shouldUseAndroidNativeDevicePermissionBridge", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("true only on android native shell", async () => {
    const cap = await import("@/lib/platform/capacitor-native");
    const mod = await import("@/lib/permissions/native-device-permissions-plugin");

    vi.mocked(cap.isCapacitorNativePlatform).mockReturnValue(false);
    vi.mocked(cap.resolveCapacitorShellPlatform).mockReturnValue("android");
    expect(mod.shouldUseAndroidNativeDevicePermissionBridge()).toBe(false);

    vi.mocked(cap.isCapacitorNativePlatform).mockReturnValue(true);
    vi.mocked(cap.resolveCapacitorShellPlatform).mockReturnValue("ios");
    expect(mod.shouldUseAndroidNativeDevicePermissionBridge()).toBe(false);

    vi.mocked(cap.resolveCapacitorShellPlatform).mockReturnValue("android");
    expect(mod.shouldUseAndroidNativeDevicePermissionBridge()).toBe(true);
  });
});
