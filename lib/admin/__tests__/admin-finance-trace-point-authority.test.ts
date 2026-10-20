import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Admin Point adjust — ledger money authority (Admin Trace A)", () => {
  // 거래 Admin 설계 v2: 본문은 공용 처리로 이동 — 라우트는 권한 키 `point` 확인 후 위임만 한다.
  const src = () => read("lib/admin/shared-handlers/admin-points-adjust.ts");

  it("route wrapper keeps `point` permission and delegates to shared handler", () => {
    const route = read("app/api/admin/points/adjust/route.ts");
    expect(route).toContain('requireAdminPermission("point")');
    expect(route).toContain("handleAdminPointsAdjustPost");
    expect(route).toContain("handleAdminPointsBalanceGet");
  });

  it("T1 — GET preview derives balance from ledger SUM", () => {
    const route = src();
    const getBlock = route.slice(route.indexOf("export async function handleAdminPointsBalanceGet"));
    expect(getBlock).toContain("readCanonicalAdminPointBalance");
    expect(route).toContain("sumUserPointLedger");
    expect(route).not.toContain("readUserPointBalance");
    // Comment may mention profiles.points as non-authority only.
    expect(route).toMatch(/profiles\.points is projection\/cache/i);
  });

  it("T2 — debit sufficiency gate derives balance from ledger SUM", () => {
    const route = src();
    const postBlock = route.slice(
      route.indexOf("export async function handleAdminPointsAdjustPost"),
      route.indexOf("export async function handleAdminPointsBalanceGet")
    );
    expect(postBlock).toContain("readCanonicalAdminPointBalance");
    expect(postBlock).toContain("insufficient_balance");
    expect(postBlock).not.toContain("readUserPointBalance");
    // C-06: 잔액 판정은 원자 RPC 가 회원 행을 잠근 뒤 원장 합계로 한다 (M7).
    const rpc = read("supabase/migrations/20270521120600_community_admin_m7_admin_point_adjust.sql");
    expect(rpc).toMatch(/for update[\s\S]*sum_user_point_ledger[\s\S]*insufficient_balance/i);
    // Helper itself is ledger-only.
    expect(route).toMatch(
      /async function readCanonicalAdminPointBalance[\s\S]*sumUserPointLedger/
    );
  });

  it("T3 — writer is the atomic RPC admin_adjust_user_points (actor + idempotency, C-04)", () => {
    const route = src();
    expect(route).toContain('rpc("admin_adjust_user_points"');
    expect(route).toContain("idempotency_key_required");
    const rpc = read("supabase/migrations/20270521120600_community_admin_m7_admin_point_adjust.sql");
    expect(rpc).toMatch(/admin_credit/);
    expect(rpc).toMatch(/admin_debit/);
    expect(rpc).toContain("uq_point_ledger_idempotency_key");
    expect(rpc).toContain("actor_id");
  });

  it("stale-projection contract — Admin must choose ledger SUM over profiles.points", () => {
    const route = src();
    const helper = route.slice(
      route.indexOf("async function readCanonicalAdminPointBalance"),
      route.indexOf("export async function handleAdminPointsAdjustPost")
    );
    expect(helper).toContain("sumUserPointLedger");
    expect(helper).not.toContain("profiles");
    expect(helper).not.toContain("readUserPointBalance");
    // Both consumers share the ledger helper.
    expect(route.match(/readCanonicalAdminPointBalance/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("F-07 projection write lock preserved — adjust route does not write profiles.points", () => {
    const route = src();
    expect(route).not.toMatch(/\.from\(\s*["']profiles["']\s*\)/);
    expect(route).not.toMatch(/points\s*:/);
    const mig = read(
      "supabase/migrations/20270118150000_finance_f07_point_projection_write_lock.sql"
    );
    expect(mig.length).toBeGreaterThan(100);
  });

  it("Admin Coin balance display does not clamp negatives (carry)", () => {
    const panels = read("components/admin/finance/AdminStoreFinancePanels.tsx");
    expect(panels).toContain("(data?.coin?.balance ?? 0).toLocaleString()");
    expect(panels).not.toMatch(/Math\.max\(0,\s*data\?\.coin\?\.balance/);
  });
});
