import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Finance legacy cleanup — money authority", () => {
  it("Ads apply pre-check uses ledger SUM (POINT_CACHE_READER_ADS_PRECHECK closed)", () => {
    const src = read("app/api/ads/apply/route.ts");
    expect(src).toContain("sumUserPointLedger");
    expect(src).toContain("spendUserPoints");
    expect(src).not.toContain("readUserPointBalance");
  });

  it("Point expire + reward + community free-cap use ledger SUM for money decisions", () => {
    // V3-06: 소멸 실행은 DB 함수 1번 — 잔액 판단은 함수 안의 sum_user_point_ledger (원장 합)
    const expire = read("lib/points/point-expire-db.ts");
    expect(expire).toContain("admin_run_point_expire");
    expect(expire).not.toContain("readUserPointBalance");
    const expireSql = read("supabase/migrations/20270523130000_admin_run_point_expire_atomic.sql");
    expect(expireSql).toContain("public.sum_user_point_ledger(v_user.user_id)");

    const reward = read("lib/point-executions/execute-point-reward-server.ts");
    expect(reward).toContain("sumUserPointLedger");
    expect(reward).not.toContain("readUserPointBalance");

    const community = read("lib/community-points/apply-community-point.ts");
    expect(community).toContain("sumUserPointLedger");
    expect(community).not.toMatch(/\.from\(\s*["']profiles["']\s*\)[\s\S]*select\(\s*["']points["']/);
  });

  it("Admin business ops Coin display uses economic accounts, not stores.point_balance", () => {
    const list = read("lib/admin-business/load-admin-business-list.ts");
    expect(list).toContain("STORE_ECONOMIC_POINT_ACCOUNTS_TABLE");
    expect(list).toContain("coinBalanceByStore");
    expect(list).not.toMatch(/pointRaw\s*=\s*full\.point_balance/);
    expect(list).not.toMatch(/Math\.max\(0,\s*Math\.floor\(Number\(pointRaw\)/);

    const detail = read("lib/admin-business/load-business-control-center-detail.ts");
    expect(detail).toContain("STORE_ECONOMIC_POINT_ACCOUNTS_TABLE");
    expect(detail).toContain("STORE_ECONOMIC_POINT_LEDGER_TABLE");
    expect(detail).not.toContain('from("store_point_ledger")');
  });

  it("Admin Point adjust still ledger-only (Admin Trace A preserved)", () => {
    // 본문은 공용 처리로 이동 (라우트는 권한 확인 후 위임)
    const adjust = read("lib/admin/shared-handlers/admin-points-adjust.ts");
    expect(adjust).toContain("sumUserPointLedger");
    expect(adjust).not.toContain("readUserPointBalance");
  });

  it("Gift conversion detail businessCredit uses economic Coin, not stores.point_balance", () => {
    const src = read("app/api/admin/gift-certificates/conversions/[id]/route.ts");
    expect(src).toContain("store_economic_point_accounts");
    expect(src).not.toMatch(/select\([^)]*point_balance/);
    expect(src).toContain("Canonical merchant Coin");
  });

  it("legacy store-point writers remain closed (410 / hard-lock)", () => {
    const adjust = read("app/api/admin/store-points/[storeId]/adjust/route.ts");
    expect(adjust).toMatch(/410|historical_store_credit_read_only/);
    const lock = read("lib/currency/currency-ssot-hard-lock.ts");
    expect(lock).toContain("stores.point_balance");
    expect(lock).toContain("store_point_ledger");
  });
});
