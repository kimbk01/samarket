/**
 * Slice 2-6 — Native/FCM Member App Icon authority (pure).
 */
import { describe, expect, it } from "vitest";
import {
  NATIVE_FCM_MEMBER_APP_ICON_AUTHORITY,
  NATIVE_FCM_ONE_LINER,
  encodeAbsoluteBadgeCountForPush,
  isForbiddenNativeFcmBadgeOp,
  nativeBadgeSetMode,
  nativeFcmAllowsStoreAxis,
  resolveMemberAppIconTotalForNativeFcm,
} from "@/lib/notifications/badge-authority-rebuild/native-fcm-member-app-icon-authority";

describe("Slice 2-6 native-fcm-member-app-icon-authority", () => {
  it("locks authority version and one-liner", () => {
    expect(NATIVE_FCM_MEMBER_APP_ICON_AUTHORITY).toBe("native_fcm_member_app_icon_authority_v1");
    expect(NATIVE_FCM_ONE_LINER).toContain("echo MemberAppIconTotal");
  });

  it("prefers memberAppIconWebTotal over appIconTotal", () => {
    expect(
      resolveMemberAppIconTotalForNativeFcm({
        memberAppIconWebTotal: 4,
        appIconTotal: 99,
      })
    ).toBe(4);
  });

  it("falls back to appIconTotal when web total absent", () => {
    expect(
      resolveMemberAppIconTotalForNativeFcm({
        appIconTotal: 7,
      })
    ).toBe(7);
  });

  it("zero is a valid absolute (clear)", () => {
    expect(
      resolveMemberAppIconTotalForNativeFcm({
        memberAppIconWebTotal: 0,
        appIconTotal: 0,
      })
    ).toBe(0);
    expect(encodeAbsoluteBadgeCountForPush(0)).toEqual({
      badgeCount: "0",
      badge_count: 0,
      alwaysSend: true,
    });
  });

  it("forbids local ±1 / accumulate ops", () => {
    expect(isForbiddenNativeFcmBadgeOp("NATIVE_PLUS_ONE")).toBe(true);
    expect(isForbiddenNativeFcmBadgeOp("FCM_MINUS_ONE")).toBe(true);
    expect(isForbiddenNativeFcmBadgeOp("LOCAL_ACCUMULATE")).toBe(true);
    expect(isForbiddenNativeFcmBadgeOp("ABSOLUTE_SET")).toBe(false);
  });

  it("excludes B_store and C_store from Native/FCM Member App Icon", () => {
    expect(nativeFcmAllowsStoreAxis("B_store")).toBe(false);
    expect(nativeFcmAllowsStoreAxis("C_store")).toBe(false);
    expect(nativeFcmAllowsStoreAxis("B_member")).toBe(true);
  });

  it("native set mode is absolute replace", () => {
    expect(nativeBadgeSetMode()).toBe("absolute_replace");
  });
});
