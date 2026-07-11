import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetNotificationPermissionSyncForTests } from "@/lib/permissions/permission-manager/notification-permission-manager";

const requestNotificationFromGuide = vi.fn();
const registerWebPushSubscriptionFromClient = vi.fn();

const notReadySnapshot = {
  effectiveState: "UNKNOWN" as const,
  notificationRuntimePermission: false,
  appNotificationsEnabled: false,
  incomingCallChannelEnabled: false,
  fullScreenIntentEnabled: true,
  batteryUnrestrictedOrUnknown: "unknown" as const,
  samsungSleepRisk: "unknown" as const,
  receiveReady: false,
  lockScreenIncomingReady: false,
  manufacturer: null,
  syncedAt: Date.now(),
};

const readySnapshot = {
  ...notReadySnapshot,
  effectiveState: "GRANTED" as const,
  notificationRuntimePermission: true,
  appNotificationsEnabled: true,
  incomingCallChannelEnabled: true,
  receiveReady: true,
  lockScreenIncomingReady: true,
};

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => false),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions/permission-manager/notification-permission-manager")>();
  return {
    ...actual,
    syncNotificationState: vi.fn(async () => notReadySnapshot),
    canRequestOsNotificationPrompt: vi.fn(() => true),
    requestNotificationFromGuide: (...args: unknown[]) => requestNotificationFromGuide(...args),
    shouldShowNotificationGuide: vi.fn(() => true),
    openNotificationSettings: vi.fn(),
  };
});

vi.mock("@/lib/push/register-web-push-subscription-client", () => ({
  registerWebPushSubscriptionFromClient: (...args: unknown[]) => registerWebPushSubscriptionFromClient(...args),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  recordDiBaYOnboardingDecision: vi.fn(),
}));

describe("runNotificationGuideFlow (web)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetNotificationPermissionSyncForTests();
    const { syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue(notReadySnapshot);
    requestNotificationFromGuide.mockResolvedValue({
      ok: true,
      snapshot: readySnapshot,
    });
  });

  it("does not call OS prompt on passive first_login", async () => {
    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("first_login");
    expect(result).toBe("declined");
    expect(requestNotificationFromGuide).not.toHaveBeenCalled();
  });

  it("calls requestNotificationFromGuide on explicit settings_retry (user gesture)", async () => {
    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("settings_retry");
    expect(requestNotificationFromGuide).toHaveBeenCalledTimes(1);
    expect(result).toBe("granted");
    expect(registerWebPushSubscriptionFromClient).toHaveBeenCalled();
  });

  it("returns browser_denied without OS request when prompt is not eligible", async () => {
    const { canRequestOsNotificationPrompt, syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(canRequestOsNotificationPrompt).mockReturnValue(false);
    vi.mocked(syncNotificationState).mockResolvedValue({
      ...notReadySnapshot,
      effectiveState: "PERMANENT_DENIED",
    });

    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("settings_retry");
    expect(result).toBe("browser_denied");
    expect(requestNotificationFromGuide).not.toHaveBeenCalled();
  });
});
