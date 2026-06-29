import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetNotificationPermissionSyncForTests,
  syncNotificationState,
} from "@/lib/permissions/permission-manager/notification-permission-manager";

const readAndroid = vi.fn(async () => ({
  effectiveState: "GRANTED" as const,
  notificationRuntimePermission: true,
  appNotificationsEnabled: true,
  incomingCallChannelEnabled: true,
  fullScreenIntentEnabled: true,
  batteryUnrestrictedOrUnknown: "unknown" as const,
  samsungSleepRisk: "unknown" as const,
  receiveReady: true,
  lockScreenIncomingReady: true,
  syncedAt: Date.now(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: vi.fn(() => true),
  resolveCapacitorShellPlatform: vi.fn(() => "android"),
}));

vi.mock("@/lib/permissions/permission-manager/adapters/android-native.adapter", () => ({
  readAndroidNotificationReceiveSnapshot: () => readAndroid(),
  requestAndroidNotificationRuntimePermission: vi.fn(),
}));

vi.mock("@/lib/permissions/permission-manager/adapters/ios-capacitor.adapter", () => ({
  readIosNotificationReceiveSnapshot: vi.fn(),
  requestIosNotificationRuntimePermission: vi.fn(),
}));

vi.mock("@/lib/permissions/permission-manager/adapters/web-notification.adapter", () => ({
  readWebNotificationReceiveSnapshot: vi.fn(() => ({
    effectiveState: "GRANTED",
    receiveReady: true,
    syncedAt: Date.now(),
  })),
  requestWebNotificationRuntimePermission: vi.fn(),
}));

describe("notification-permission sync dedupe", () => {
  beforeEach(() => {
    resetNotificationPermissionSyncForTests();
    readAndroid.mockClear();
  });

  it("single-flights parallel syncNotificationState on native", async () => {
    const [a, b] = await Promise.all([syncNotificationState(), syncNotificationState()]);
    expect(a.receiveReady).toBe(true);
    expect(b.receiveReady).toBe(true);
    expect(readAndroid).toHaveBeenCalledTimes(1);
  });

  it("force refresh bypasses inflight dedupe", async () => {
    await syncNotificationState();
    await syncNotificationState({ force: true });
    expect(readAndroid).toHaveBeenCalledTimes(2);
  });

  it("resume force bypasses TTL cache", async () => {
    await syncNotificationState();
    readAndroid.mockClear();
    await syncNotificationState({ force: true });
    expect(readAndroid).toHaveBeenCalledTimes(1);
  });
});
