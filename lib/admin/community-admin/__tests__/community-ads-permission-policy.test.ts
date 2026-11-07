/**
 * Owner 결정 (PR #86): 홍보 권한(ads)은 모든 활성 관리 운영자 기본 권한.
 * 정지 운영자는 홍보 조치 불가, 금전 규칙(사유·귀책·환급 RPC)은 그대로.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { communityAreaAllowed } from "@/lib/admin/community-admin/community-admin-permissions";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("community ads permission policy", () => {
  it("operator / manager defaults include ads; other operator defaults unchanged", () => {
    expect(DEFAULT_PERMISSIONS_BY_ROLE.operator).toContain("ads");
    expect(DEFAULT_PERMISSIONS_BY_ROLE.manager).toContain("ads");
    for (const k of ["boards", "reports", "users", "chats", "business"] as const) {
      expect(DEFAULT_PERMISSIONS_BY_ROLE.operator).toContain(k);
    }
    expect(DEFAULT_PERMISSIONS_BY_ROLE.operator).not.toContain("point");
    expect(communityAreaAllowed(DEFAULT_PERMISSIONS_BY_ROLE.operator, "promotion")).toBe(true);
    expect(communityAreaAllowed(DEFAULT_PERMISSIONS_BY_ROLE.operator, "points")).toBe(false);
  });

  it("server gate blocks suspended operators from promotion actions", () => {
    const src = read("lib/admin/community-admin/community-admin-guards.ts");
    expect(src).toContain('area === "promotion"');
    expect(src).toContain("isSuspendedMemberAccount");
    expect(src).toContain("admin_account_suspended");
  });

  it("promotion end still requires fault + reason and uses the refund RPC", () => {
    const route = read("app/api/admin/community-promotion-orders/[id]/route.ts");
    // 광고 SSOT §4 (2026-11-07): 상위노출 쓰기 = ads 키 전용 가드(정지 운영자는 requireAdminApiActor 가 막는다)
    expect(route).toContain("requireAdsWriteAdmin()");
    const gate = read("lib/admin/access/require-ads-write-admin.ts");
    expect(gate).toContain('requireAdminPermission("ads")');
    expect(read("lib/admin/require-admin-permission.ts")).toContain("admin_actor_suspended");
    // H-3: 사유·귀책 규칙은 광고 허브와 같은 단일 구현에 있다
    expect(route).toContain("runCommunityPromotionOrderAction");
    const action = read("lib/admin/community-admin/community-promotion-order-action.ts");
    expect(action).toContain("fault_required");
    expect(action).toContain("reason_required");
    const rpc = read("supabase/migrations/20270521120800_community_admin_m9_promotion_refund.sql");
    expect(rpc).toContain("uq_point_ledger_promotion_refund_once");
  });

  it("data migration adds ads only to active non-super operators with explicit rows", () => {
    const sql = read("supabase/migrations/20270521121300_community_admin_ads_for_all_active_operators.sql");
    expect(sql).toContain("m.status = 'active'");
    expect(sql).toContain("m.role = 'admin'");
    expect(sql).toContain("not (p.permissions ? 'ads')");
  });
});
