/**
 * Phase 2-4 — Native Runtime Identity contracts (static wires).
 * DO NOT: Projection · Writer · Bell · RoomUnread · Heal · OEM patch
 */
import { describe, expect, it } from "vitest";
import {
  BADGE_NATIVE_IDENTITY_WIRES,
  BADGE_NATIVE_RUNTIME_AUTHORITY,
  assertBadgeNativeIdentityWires,
  assertNativeIdentityEqual,
} from "@/lib/notifications/badge-native-runtime-identity";

describe("Phase 2-4 Badge Native Runtime Identity", () => {
  it("authority id", () => {
    expect(BADGE_NATIVE_RUNTIME_AUTHORITY).toBe("domain_badge_native_identity_v1");
  });

  it("wires Cap / NativeBadgeSync / FCM / setNumber / APNS / iOS Delivery / logout clear", () => {
    const surfaces = new Set(BADGE_NATIVE_IDENTITY_WIRES.map((w) => w.surface));
    for (const s of [
      "capawesome_badge",
      "native_badge_sync",
      "fcm_badge_count",
      "android_tray_setNumber",
      "apns_badge",
      "ios_delivery_adapter",
      "logout_clear",
    ]) {
      expect(surfaces.has(s)).toBe(true);
    }
  });

  it("static wire scan PASS", () => {
    const r = assertBadgeNativeIdentityWires();
    expect(r).toEqual(expect.objectContaining({ ok: true, errors: [] }));
  });

  it("assertNativeIdentityEqual requires Projection == Badge.get", () => {
    expect(
      assertNativeIdentityEqual({
        projectionAppIcon: 32,
        badgeGet: 32,
        surfaceStoreAppIcon: 32,
        fcmBadgeCountWire: 32,
        apnsBadgeWire: 32,
      })
    ).toEqual({ ok: true, errors: [] });

    expect(
      assertNativeIdentityEqual({
        projectionAppIcon: 32,
        badgeGet: 31,
        surfaceStoreAppIcon: null,
        fcmBadgeCountWire: null,
        apnsBadgeWire: null,
      }).ok
    ).toBe(false);
  });
});
