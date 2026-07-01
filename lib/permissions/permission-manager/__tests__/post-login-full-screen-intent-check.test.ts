import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/push/native/check-android-full-screen-intent", () => ({
  checkAndroidFullScreenIntentGranted: vi.fn(),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  openFullScreenIntentSettings: vi.fn(async () => true),
}));

describe("post-login-full-screen-intent-check", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    const { resetPostLoginFullScreenIntentCheckForTests } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    resetPostLoginFullScreenIntentCheckForTests();
  });

  it("opens OS settings when FSI is disabled (no app modal)", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);

    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    const result = await runPostLoginFullScreenIntentCheck();

    expect(result).toBe("opened_settings");
    expect(openFullScreenIntentSettings).toHaveBeenCalledTimes(1);
  });

  it("skips when FSI already granted", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    const { openFullScreenIntentSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(true);

    const { runPostLoginFullScreenIntentCheck } = await import(
      "@/lib/permissions/permission-manager/post-login-full-screen-intent-check"
    );
    const result = await runPostLoginFullScreenIntentCheck();

    expect(result).toBe("granted");
    expect(openFullScreenIntentSettings).not.toHaveBeenCalled();
  });
});
