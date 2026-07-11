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

describe("runPostLoginFullScreenIntentCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not open settings when FSI is not granted", async () => {
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

    expect(result).toBe("skipped");
    expect(openFullScreenIntentSettings).not.toHaveBeenCalled();
  });

  it("returns granted when FSI already enabled", async () => {
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
