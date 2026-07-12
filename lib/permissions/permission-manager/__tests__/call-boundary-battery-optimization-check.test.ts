import { beforeEach, describe, expect, it, vi } from "vitest";

const batteryRestrictedSnapshot = {
  effectiveState: "GRANTED" as const,
  notificationRuntimePermission: true,
  appNotificationsEnabled: true,
  incomingCallChannelEnabled: true,
  fullScreenIntentEnabled: true,
  batteryUnrestrictedOrUnknown: "restricted" as const,
  samsungSleepRisk: "unknown" as const,
  receiveReady: true,
  lockScreenIncomingReady: false,
  syncedAt: Date.now(),
};

const notReadySnapshot = {
  ...batteryRestrictedSnapshot,
  effectiveState: "UNKNOWN" as const,
  notificationRuntimePermission: false,
  receiveReady: false,
};

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/permission-manager/notification-permission-manager")>();
  return {
    ...actual,
    syncNotificationState: vi.fn(async () => batteryRestrictedSnapshot),
    openBatteryOptimizationSettings: vi.fn(async () => true),
  };
});

describe("runCallBoundaryBatteryOptimizationCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("opens battery settings when restricted and receiveReady", async () => {
    const { openBatteryOptimizationSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    const { runCallBoundaryBatteryOptimizationCheck } = await import(
      "@/lib/permissions/permission-manager/call-boundary-battery-optimization-check"
    );
    const result = await runCallBoundaryBatteryOptimizationCheck();
    expect(result).toBe("opened_settings");
    expect(openBatteryOptimizationSettings).toHaveBeenCalledTimes(1);
  });

  it("skips when receiveReady is false", async () => {
    const { syncNotificationState, openBatteryOptimizationSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue(notReadySnapshot);

    const { runCallBoundaryBatteryOptimizationCheck } = await import(
      "@/lib/permissions/permission-manager/call-boundary-battery-optimization-check"
    );
    const result = await runCallBoundaryBatteryOptimizationCheck();
    expect(result).toBe("skipped");
    expect(openBatteryOptimizationSettings).not.toHaveBeenCalled();
  });

  it("skips repeat nudge in same session", async () => {
    const { openBatteryOptimizationSettings } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    const { runCallBoundaryBatteryOptimizationCheck } = await import(
      "@/lib/permissions/permission-manager/call-boundary-battery-optimization-check"
    );
    await runCallBoundaryBatteryOptimizationCheck();
    vi.mocked(openBatteryOptimizationSettings).mockClear();
    const second = await runCallBoundaryBatteryOptimizationCheck();
    expect(second).toBe("skipped");
    expect(openBatteryOptimizationSettings).not.toHaveBeenCalled();
  });
});
