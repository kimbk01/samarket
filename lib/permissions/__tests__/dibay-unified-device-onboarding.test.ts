import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaPermissionState = vi.hoisted(() => ({
  camera: "unknown" as PermissionState | null,
  microphone: "unknown" as PermissionState | null,
}));

vi.mock("@/lib/auth/get-current-user", () => ({
  getSyncViewerUserIdForClient: vi.fn(() => "user-1"),
}));

vi.mock("@/lib/notifications/dibay-notification-prompt-storage", () => ({
  shouldOfferDiBaYNotificationPrePrompt: vi.fn(() => true),
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
    vi.stubGlobal("window", {
      Notification: { permission: "default" as NotificationPermission },
    });
  });

  it("orders notification before camera and microphone", async () => {
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

  it("skips notification when browser permission is already decided", async () => {
    vi.stubGlobal("window", {
      Notification: { permission: "granted" },
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
