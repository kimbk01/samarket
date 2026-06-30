import { beforeEach, describe, expect, it, vi } from "vitest";

const syncNotificationState = vi.hoisted(() => vi.fn());
const getCachedNotificationReceiveSnapshot = vi.hoisted(() => vi.fn());
const callPermissionCheck = vi.hoisted(() => vi.fn());
const checkAndroidCallReceiveSettings = vi.hoisted(() => vi.fn());
const isCapacitorNativePlatform = vi.hoisted(() => vi.fn(() => true));
const resolveCapacitorShellPlatform = vi.hoisted(() => vi.fn((): "android" | "ios" | null => "android"));

vi.mock("@/lib/permissions/permission-manager/notification-permission-manager", () => ({
  syncNotificationState,
  getCachedNotificationReceiveSnapshot,
}));

vi.mock("@/lib/call/permissions/call-permission-gate", () => ({
  callPermissionGate: { check: callPermissionCheck },
}));

vi.mock("@/lib/permissions/native-device-permissions-plugin", () => ({
  checkAndroidCallReceiveSettings,
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform,
  resolveCapacitorShellPlatform,
}));

import { buildPermissionCapabilitySummary } from "@/lib/permissions/education/permission-capability-summary";

const baseSnapshot = {
  effectiveState: "GRANTED" as const,
  notificationRuntimePermission: true,
  appNotificationsEnabled: true,
  incomingCallChannelEnabled: true,
  fullScreenIntentEnabled: false,
  batteryUnrestrictedOrUnknown: "restricted" as const,
  samsungSleepRisk: "unknown" as const,
  receiveReady: true,
  lockScreenIncomingReady: false,
  blockReason: "fsi_disabled",
  manufacturer: "samsung",
  syncedAt: 1,
};

describe("buildPermissionCapabilitySummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedNotificationReceiveSnapshot.mockReturnValue(baseSnapshot);
    syncNotificationState.mockResolvedValue(baseSnapshot);
    callPermissionCheck.mockResolvedValue({
      canVoice: true,
      canVideo: false,
    });
    checkAndroidCallReceiveSettings.mockResolvedValue({
      receiveReady: true,
      lockScreenIncomingReady: false,
      fullScreenIntentAllowed: false,
      lockScreenBlockReason: "fsi_disabled",
      manufacturer: "samsung",
    });
    isCapacitorNativePlatform.mockReturnValue(true);
    resolveCapacitorShellPlatform.mockReturnValue("android");
  });

  it("aggregates six mobile checklist rows on android native", async () => {
    const summary = await buildPermissionCapabilitySummary();
    expect(summary.items).toHaveLength(6);
    expect(summary.receiveReady).toBe(true);
    expect(summary.lockScreenIncomingReady).toBe(false);
    expect(summary.overallReady).toBe(false);
    expect(summary.items.find((i) => i.id === "full_screen_intent")?.pass).toBe(false);
    expect(summary.items.find((i) => i.id === "battery")?.pass).toBe(false);
    expect(summary.items.find((i) => i.id === "microphone")?.pass).toBe(true);
    expect(summary.items.find((i) => i.id === "camera")?.pass).toBe(false);
  });

  it("excludes mobile-only rows on web/windows", async () => {
    isCapacitorNativePlatform.mockReturnValue(false);
    resolveCapacitorShellPlatform.mockReturnValue(null);
    const summary = await buildPermissionCapabilitySummary();
    expect(summary.items.map((i) => i.id)).toEqual(["notifications", "microphone", "camera"]);
    expect(summary.overallReady).toBe(false);
  });
});
