import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  syncNotificationState: vi.fn(),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  syncDiBaYOnboardingFromBrowserPermission: vi.fn(),
  recordDiBaYOnboardingDecision: vi.fn(),
}));

vi.mock("@/lib/permissions/dibay-device-permission-onboarding", () => ({
  resolveCallMediaOnboardingSource: vi.fn(() => "first_login"),
  resolveDibayDevicePermissionOnboarding: vi.fn(),
  isDibayDevicePermissionGranted: vi.fn(() => false),
}));

describe("dibay-unified-device-onboarding", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("orders notification before camera and microphone", async () => {
    const { syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue({
      effectiveState: "UNKNOWN",
      notificationRuntimePermission: false,
      appNotificationsEnabled: true,
      incomingCallChannelEnabled: true,
      fullScreenIntentEnabled: true,
      batteryUnrestrictedOrUnknown: "unknown",
      samsungSleepRisk: "unknown",
      receiveReady: false,
      lockScreenIncomingReady: false,
      syncedAt: Date.now(),
    });

    const { resolveDibayDevicePermissionOnboarding } = await import(
      "@/lib/permissions/dibay-device-permission-onboarding"
    );
    vi.mocked(resolveDibayDevicePermissionOnboarding).mockResolvedValue({
      shouldShow: true,
      source: "first_login",
      state: {
        camera: "unknown",
        microphone: "unknown",
        requestedAt: null,
        grantedAt: null,
        source: null,
      },
    });
    const { resolveDibayUnifiedOnboardingPlan } = await import("@/lib/permissions/dibay-unified-device-onboarding");
    const plan = await resolveDibayUnifiedOnboardingPlan();
    expect(plan.steps).toEqual(["notification", "camera", "microphone"]);
  });

  it("skips notification when receiveReady is true", async () => {
    const { syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue({
      effectiveState: "GRANTED",
      notificationRuntimePermission: true,
      appNotificationsEnabled: true,
      incomingCallChannelEnabled: true,
      fullScreenIntentEnabled: true,
      batteryUnrestrictedOrUnknown: "unknown",
      samsungSleepRisk: "unknown",
      receiveReady: true,
      lockScreenIncomingReady: true,
      syncedAt: Date.now(),
    });

    const { resolveDibayDevicePermissionOnboarding } = await import(
      "@/lib/permissions/dibay-device-permission-onboarding"
    );
    vi.mocked(resolveDibayDevicePermissionOnboarding).mockResolvedValue({
      shouldShow: true,
      source: "first_login",
      state: {
        camera: "unknown",
        microphone: "unknown",
        requestedAt: null,
        grantedAt: null,
        source: null,
      },
    });
    const { resolveDibayUnifiedOnboardingPlan } = await import("@/lib/permissions/dibay-unified-device-onboarding");
    const plan = await resolveDibayUnifiedOnboardingPlan();
    expect(plan.steps).toEqual(["camera", "microphone"]);
  });
});
