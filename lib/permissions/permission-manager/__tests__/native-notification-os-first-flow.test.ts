import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetNotificationPermissionSyncForTests } from "@/lib/permissions/permission-manager/notification-permission-manager";

const openNotificationGuideModal = vi.fn();
const requestNotificationFromGuide = vi.fn();
const registerNativePushFromClient = vi.fn();

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
  manufacturer: "samsung",
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
  isCapacitorNativePlatform: vi.fn(() => true),
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-ui-bridge", () => ({
  openNotificationGuideModal: (...args: unknown[]) => openNotificationGuideModal(...args),
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

vi.mock("@/lib/push/native/register-native-push-client", () => ({
  registerNativePushFromClient: (...args: unknown[]) => registerNativePushFromClient(...args),
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUserIdForDb: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/permissions/device-permission-manager", () => ({
  recordDiBaYOnboardingDecision: vi.fn(),
}));

describe("runNotificationGuideFlow (native OS-first)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetNotificationPermissionSyncForTests();
    const { syncNotificationState, canRequestOsNotificationPrompt } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(syncNotificationState).mockResolvedValue(notReadySnapshot);
    vi.mocked(canRequestOsNotificationPrompt).mockReturnValue(true);
    requestNotificationFromGuide.mockResolvedValue({
      ok: true,
      snapshot: readySnapshot,
    });
    openNotificationGuideModal.mockResolvedValue("later");
  });

  it("first_login calls OS request directly without app guide modal", async () => {
    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("first_login");
    expect(openNotificationGuideModal).not.toHaveBeenCalled();
    expect(requestNotificationFromGuide).toHaveBeenCalledTimes(1);
    expect(result).toBe("granted");
    expect(registerNativePushFromClient).toHaveBeenCalled();
  });

  it("disabled_resume does not open app modal or OS prompt", async () => {
    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("disabled_resume");
    expect(result).toBe("declined");
    expect(openNotificationGuideModal).not.toHaveBeenCalled();
    expect(requestNotificationFromGuide).not.toHaveBeenCalled();
  });

  it("settings_retry opens settings-only modal when OS prompt unavailable", async () => {
    const { canRequestOsNotificationPrompt, syncNotificationState } = await import(
      "@/lib/permissions/permission-manager/notification-permission-manager"
    );
    vi.mocked(canRequestOsNotificationPrompt).mockReturnValue(false);
    vi.mocked(syncNotificationState).mockResolvedValue({
      ...notReadySnapshot,
      effectiveState: "PERMANENT_DENIED",
    });
    openNotificationGuideModal.mockResolvedValue("open_settings");

    const { runNotificationGuideFlow } = await import(
      "@/lib/permissions/permission-manager/notification-onboarding-flow"
    );
    const result = await runNotificationGuideFlow("settings_retry");
    expect(openNotificationGuideModal).toHaveBeenCalledTimes(1);
    expect(requestNotificationFromGuide).not.toHaveBeenCalled();
    expect(result).toBe("browser_denied");
  });
});
