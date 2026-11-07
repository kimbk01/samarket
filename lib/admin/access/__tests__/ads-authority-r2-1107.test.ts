/**
 * 광고 SSOT §4 권한 표 (Owner 「설계안대로 진행」 2026-11-07) — 공통·도메인 같은 키.
 * 상위노출 쓰기 = ads · 인트로·시작 화면 쓰기 = ads · 커뮤니티 상위노출 조회 = 공통과 같은 전원(AD2-08) ·
 * 캐시 충전 대기열 화면 = API 같은 business(AD2-09) · 꺼짐 이유 = 권한 이름(코드값 노출 없음).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  actorMeetsAdminRouteRequirement,
  advertisingWorkspaceFamilyActionRequirement,
  canAccessAdminRoute,
  canActOnAdminRoute,
  resolveAdminRouteAccess,
  type AdminRouteAccessActor,
} from "@/lib/admin/access/admin-route-access";
import { describeAdminRequirementDenial } from "@/lib/admin/access/admin-access-ui";
import {
  ADMIN_AD_DELETE_KINDS,
  ADS_BOOST_WRITE_REQUIREMENT,
  adminAdKindWriteRequirement,
} from "@/lib/admin/access/admin-ads-authority";
import { ADMIN_AUTHORITY_FAMILY_WRITE_PERMISSION, isAdminAuthorityCtaAllowed } from "@/lib/ads/admin-authority-matrix";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const ADS_ONLY: AdminRouteAccessActor = { role: "admin", permissions: ["ads"] };
const BUSINESS_ONLY: AdminRouteAccessActor = { role: "admin", permissions: ["business"] };
const NO_ADS: AdminRouteAccessActor = { role: "admin", permissions: ["boards", "reports", "business", "point"] };
const SUSPENDED_ADS: AdminRouteAccessActor = { role: "admin", permissions: ["ads"], accountSuspended: true };
const SUPER: AdminRouteAccessActor = { role: "super_admin", permissions: [] };

describe("상위노출 쓰기 = ads (도메인 화면 = 공통 화면 = API)", () => {
  it("거래·커뮤니티 상위노출 화면 작업 키 = ads · 공통 드로어 계열 키 = ads", () => {
    for (const page of ["/admin/trade/promotions", "/admin/community/promotions"]) {
      expect(resolveAdminRouteAccess(page).actionRequirement, page).toEqual({ kind: "permission", key: "ads" });
      expect(canActOnAdminRoute(page, ADS_ONLY), page).toBe(true);
      expect(canActOnAdminRoute(page, NO_ADS), page).toBe(false);
      expect(canActOnAdminRoute(page, SUSPENDED_ADS), page).toBe(false);
      expect(canActOnAdminRoute(page, SUPER), page).toBe(true);
    }
    expect(advertisingWorkspaceFamilyActionRequirement("boost_trade")).toEqual(ADS_BOOST_WRITE_REQUIREMENT);
    expect(advertisingWorkspaceFamilyActionRequirement("boost_community")).toEqual(ADS_BOOST_WRITE_REQUIREMENT);
  });

  it("도메인 API 쓰기 가드 = requireAdsWriteAdmin (= ads) · 공통 계열 가드도 ads", () => {
    expect(read("app/api/admin/trade/promotions/[id]/route.ts")).toContain("await requireAdsWriteAdmin()");
    expect(read("app/api/admin/trade/promotions/[id]/route.ts")).not.toContain("requireTradeAdmin()");
    expect(read("app/api/admin/community-promotion-orders/[id]/route.ts")).toContain("await requireAdsWriteAdmin()");
    expect(read("lib/admin/access/require-ads-write-admin.ts")).toContain('requireAdminPermission("ads")');
    const gate = read("lib/admin/advertising-workspace/workspace-memo-gate.ts");
    expect(gate).toMatch(/boost_trade" \|\| family === "boost_community"\) return requireAdminPermission\("ads"\)/);
  });

  it("AD2-08: 커뮤니티 상위노출 조회 = 공통 광고 화면과 같은 전원 (화면·API)", () => {
    expect(resolveAdminRouteAccess("/admin/community/promotions").requirement).toEqual(
      resolveAdminRouteAccess("/admin/advertising").requirement
    );
    expect(canAccessAdminRoute("/admin/community/promotions", { role: "admin", permissions: [] })).toBe(true);
    expect(read("app/api/admin/community-promotion-orders/route.ts")).toContain("await requireAdminApiActor()");
  });
});

describe("인트로·시작 화면 쓰기 = ads (settings 에서 이동)", () => {
  it("화면 작업 키 · API 가드 같은 키", () => {
    for (const page of ["/admin/platform-promotion/intro", "/admin/platform-promotion/os-start"]) {
      expect(resolveAdminRouteAccess(page).actionRequirement, page).toEqual({ kind: "permission", key: "ads" });
      expect(canActOnAdminRoute(page, { role: "admin", permissions: ["settings"] }), page).toBe(false);
    }
    for (const f of [
      "app/api/admin/launch-intro/route.ts",
      "app/api/admin/launch-intro/publish/route.ts",
      "app/api/admin/launch-intro/state/route.ts",
      "app/api/admin/launch-intro/upload/route.ts",
      "app/api/admin/os-launch/route.ts",
      "app/api/admin/os-launch/logo/route.ts",
    ]) {
      const src = read(f);
      expect(src, f).toContain('requireAdminPermission("ads")');
      expect(src, f).not.toContain('requireAdminPermission("settings")');
    }
    // 앱 공통 설정(시작 설정)은 settings 그대로
    expect(resolveAdminRouteAccess("/admin/settings/startup-config").actionRequirement).toEqual({ kind: "permission", key: "settings" });
  });
});

describe("AD2-09: 비즈니스 캐시 충전 대기열 화면 = 조회 API 같은 business", () => {
  it("화면 열람 키 = business · API GET = business", () => {
    expect(resolveAdminRouteAccess("/admin/delivery-ads/cash-charges").requirement).toEqual({ kind: "permission", key: "business" });
    expect(canAccessAdminRoute("/admin/delivery-ads/cash-charges", ADS_ONLY)).toBe(false);
    expect(canAccessAdminRoute("/admin/delivery-ads/cash-charges", BUSINESS_ONLY)).toBe(true);
    expect(read("app/api/admin/business-cash-charges/route.ts")).toContain('requireAdminPermission("business")');
    // 배달 광고 다른 화면은 열람 전원 그대로
    expect(canAccessAdminRoute("/admin/delivery-ads/abc", ADS_ONLY)).toBe(true);
  });
});

describe("광고 삭제 권한 표 · 꺼짐 이유", () => {
  it("배달 광고·사장님 팝업 = business · 그 밖 = ads", () => {
    for (const k of ADMIN_AD_DELETE_KINDS) {
      const req = adminAdKindWriteRequirement(k);
      const expected = k === "delivery_banner" || k === "delivery_sponsored" ? "business" : "ads";
      expect(req, k).toEqual({ kind: "permission", key: expected });
    }
    expect(adminAdKindWriteRequirement("popup_campaign", { ownerPopup: true })).toEqual({ kind: "permission", key: "business" });
    expect(ADMIN_AUTHORITY_FAMILY_WRITE_PERMISSION.boost_trade).toBe("ads");
    expect(ADMIN_AUTHORITY_FAMILY_WRITE_PERMISSION.delivery_banner).toBe("business");
    expect(isAdminAuthorityCtaAllowed("boost_trade", "DELETE")).toBe(true);
    expect(isAdminAuthorityCtaAllowed("feed_banner", "UNDELETE")).toBe(true);
    expect(actorMeetsAdminRouteRequirement(adminAdKindWriteRequirement("delivery_banner"), ADS_ONLY)).toBe(false);
  });

  it("꺼짐 이유 = 「권한 이름」 권한이 필요합니다 (코드값 노출 없음)", () => {
    expect(describeAdminRequirementDenial({ kind: "permission", key: "ads" })).toBe("「광고/노출」 권한이 필요합니다.");
    expect(describeAdminRequirementDenial({ kind: "permission", key: "business" })).toBe("「매장 (배달관련)」 권한이 필요합니다.");
    expect(describeAdminRequirementDenial({ kind: "permission", key: "ads" }, "en")).toBe("Requires the “Ads & placement” permission.");
    expect(describeAdminRequirementDenial({ kind: "domain", guard: "community", area: "moderation" })).toBe(
      "커뮤니티 「신고 처리」 권한이 필요합니다."
    );
    expect(describeAdminRequirementDenial({ kind: "permission", key: "ads" })).not.toMatch(/\bads\b/);
  });
});
