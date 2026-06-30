// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationReceiveSnapshot } from "@/lib/permissions/permission-manager/notification-permission-types";
import {
  getFullScreenIntentGuidePending,
  resetFullScreenIntentGuideBridgeForTests,
  settleFullScreenIntentGuideSheet,
} from "@/lib/permissions/permission-manager/full-screen-intent-guide-bridge";
import { resetFullScreenIntentGuideStorageForTests } from "@/lib/permissions/permission-manager/full-screen-intent-guide-storage";

const readySnapshot: NotificationReceiveSnapshot = {
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
};

const syncNotificationStateMock = vi.hoisted(() =>
  vi.fn(async () => readySnapshot),
);
const openFullScreenIntentSettingsMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
  resolveCapacitorShellPlatform: () => "android",
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-ui-bridge", () => ({
  getNotificationGuidePending: () => null,
}));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  syncNotificationState: syncNotificationStateMock,
  openFullScreenIntentSettings: openFullScreenIntentSettingsMock,
}));

describe("full-screen-intent-guide-flow", () => {
  beforeEach(() => {
    const ls: Record<string, string> = {};
    const ss: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => ls[key] ?? null,
      setItem: (key: string, value: string) => {
        ls[key] = value;
      },
      removeItem: (key: string) => {
        delete ls[key];
      },
    });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => ss[key] ?? null,
      setItem: (key: string, value: string) => {
        ss[key] = value;
      },
      removeItem: (key: string) => {
        delete ss[key];
      },
    });
    resetFullScreenIntentGuideStorageForTests();
    resetFullScreenIntentGuideBridgeForTests();
    syncNotificationStateMock.mockClear();
    openFullScreenIntentSettingsMock.mockClear();
  });

  it("shows login guide only when receiveReady and FSI disabled", async () => {
    const { shouldShowLoginFullScreenIntentGuide } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-flow"
    );
    expect(shouldShowLoginFullScreenIntentGuide(readySnapshot)).toBe(true);
    expect(
      shouldShowLoginFullScreenIntentGuide({ ...readySnapshot, fullScreenIntentEnabled: true }),
    ).toBe(false);
    expect(shouldShowLoginFullScreenIntentGuide({ ...readySnapshot, receiveReady: false })).toBe(false);
  });

  it("marks session later and skips repeat login guide", async () => {
    const { markFsiSessionLater } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-storage"
    );
    const { shouldShowLoginFullScreenIntentGuide, runLoginFullScreenIntentGuideIfNeeded } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-flow"
    );

    markFsiSessionLater();
    expect(shouldShowLoginFullScreenIntentGuide(readySnapshot)).toBe(false);

    const shown = await runLoginFullScreenIntentGuideIfNeeded({ notificationOnboardingSettled: true });
    expect(shown).toBe(false);
  });

  it("opens settings on login guide confirm", async () => {
    const { runLoginFullScreenIntentGuideIfNeeded } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-flow"
    );

    const pending = runLoginFullScreenIntentGuideIfNeeded({ notificationOnboardingSettled: true });
    await Promise.resolve();
    settleFullScreenIntentGuideSheet("open_settings");
    const shown = await pending;

    expect(shown).toBe(true);
    expect(openFullScreenIntentSettingsMock).toHaveBeenCalledTimes(1);
    expect(syncNotificationStateMock).toHaveBeenCalledWith({ force: true });
  });

  it("dismisses pending sheet when FSI granted on resume", async () => {
    const { dismissFullScreenIntentGuideIfGranted, runFullScreenIntentEducationBeforeCall } =
      await import("@/lib/permissions/permission-manager/full-screen-intent-guide-flow");

    const pending = runFullScreenIntentEducationBeforeCall();
    await Promise.resolve();
    dismissFullScreenIntentGuideIfGranted(true);
    await pending;

    expect(getFullScreenIntentGuidePending()).toBeNull();
  });

  it("allows call-time education after permanent dismiss", async () => {
    const { markFsiPermanentDismiss } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-storage"
    );
    const { shouldShowLoginFullScreenIntentGuide, runFullScreenIntentEducationBeforeCall } = await import(
      "@/lib/permissions/permission-manager/full-screen-intent-guide-flow"
    );

    markFsiPermanentDismiss();
    expect(shouldShowLoginFullScreenIntentGuide(readySnapshot)).toBe(false);

    const pending = runFullScreenIntentEducationBeforeCall();
    await Promise.resolve();
    settleFullScreenIntentGuideSheet("later");
    await pending;

    expect(openFullScreenIntentSettingsMock).not.toHaveBeenCalled();
  });
});
