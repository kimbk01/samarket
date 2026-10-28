/**
 * iOS 알림 권한 단일 경로 (실기 2026-10-29 · iPhone 1.2 (16) 새 설치):
 * Capawesome Badge.set/clear 는 호출마다 requestAuthorization(.badge) 를 해 첫 권한 창을 「배지만」으로 굳혔다.
 * iOS 아이콘 숫자는 DibayAppIconDelivery 단독, Android 는 기존대로 Capawesome echo + 어댑터.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = { value: "ios" };
const badge = {
  isSupported: vi.fn(async () => ({ isSupported: true })),
  set: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
};
const deliveryApply = vi.fn(async () => ({ ok: true }));

vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => platform.value },
  registerPlugin: () => ({ apply: (o: { count: number }) => deliveryApply(o) }),
}));
vi.mock("@/lib/platform/capacitor-native", () => ({ isCapacitorNativePlatform: () => true }));
vi.mock("@/lib/notifications/badge-fd-probe-log", () => ({ logBadgeFdProbe: () => undefined }));
vi.mock("@capawesome/capacitor-badge", () => ({ Badge: badge }));
vi.mock("@/lib/push/native/logout-badge-clear-transaction", () => ({
  hasPendingLogoutBadgeClearTransaction: () => false,
}));

describe("syncNativeBadgeCount — iOS 는 권한을 요청하는 Capawesome 메서드를 부르지 않는다", () => {
  beforeEach(() => {
    badge.isSupported.mockClear();
    badge.set.mockClear();
    badge.clear.mockClear();
    deliveryApply.mockClear();
  });

  it("iOS: 숫자 쓰기·지우기 모두 DibayAppIconDelivery 만", async () => {
    platform.value = "ios";
    const { syncNativeBadgeCount } = await import("@/lib/push/native/sync-native-badge-count");
    await syncNativeBadgeCount(7);
    await syncNativeBadgeCount(0);
    expect(badge.set).not.toHaveBeenCalled();
    expect(badge.clear).not.toHaveBeenCalled();
    expect(deliveryApply.mock.calls.map((c) => c[0])).toEqual([{ count: 7 }, { count: 0 }]);
  });

  it("Android: 기존대로 Capawesome echo + 어댑터", async () => {
    platform.value = "android";
    const { syncNativeBadgeCount } = await import("@/lib/push/native/sync-native-badge-count");
    await syncNativeBadgeCount(5);
    await syncNativeBadgeCount(0);
    expect(badge.set).toHaveBeenCalledWith({ count: 5 });
    expect(badge.clear).toHaveBeenCalledTimes(1);
    expect(deliveryApply).toHaveBeenCalledTimes(2);
  });
});
