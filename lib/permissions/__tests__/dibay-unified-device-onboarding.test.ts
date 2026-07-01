import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  syncNotificationState: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/push/native/check-android-full-screen-intent", () => ({
  checkAndroidFullScreenIntentGranted: vi.fn(),
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

  it("includes notification only when receiveReady is false", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(true);
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
    expect(plan.steps).toEqual(["notification"]);
  });

  it("includes full_screen_intent when receiveReady and FSI disabled", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(false);
    const { syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue({
      effectiveState: "GRANTED",
      notificationRuntimePermission: true,
      appNotificationsEnabled: true,
      incomingCallChannelEnabled: true,
      fullScreenIntentEnabled: false,
      batteryUnrestrictedOrUnknown: "unknown",
      samsungSleepRisk: "unknown",
      receiveReady: true,
      lockScreenIncomingReady: false,
      syncedAt: Date.now(),
    });

    const { resolveDibayDevicePermissionOnboarding } = await import(
      "@/lib/permissions/dibay-device-permission-onboarding"
    );
    vi.mocked(resolveDibayDevicePermissionOnboarding).mockResolvedValue({
      shouldShow: false,
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
    expect(plan.steps).toEqual(["full_screen_intent"]);
  });

  it("skips all steps when receiveReady is true", async () => {
    const { checkAndroidFullScreenIntentGranted } = await import(
      "@/lib/push/native/check-android-full-screen-intent"
    );
    vi.mocked(checkAndroidFullScreenIntentGranted).mockResolvedValue(true);
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
    expect(plan.steps).toEqual([]);
  });
});
