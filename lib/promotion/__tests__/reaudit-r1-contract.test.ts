import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** 재감사 R1 — E-11·E-9·E-10 계약 */
describe("reaudit R1", () => {
  it("E-11: paused order counts as running for the seller ad sheet (DB also blocks it)", () => {
    const route = src("app/api/me/points/promotion-orders/route.ts");
    /** 재감사 B-1: 판정 1곳 — 노출·일시정지·심사 중 = 진행 중(DB `already_active_promotion` 과 같음) */
    expect(route).toContain("isTradeBoostOrderOngoing(o, now)");
    const sheet = src("components/trade/seller-ad/TradeAdQuickSheet.tsx");
    expect(sheet).toContain('paused: st === "paused"');
    expect(sheet).toContain(`t("trade_ad_boost_paused_short")`);
  });
  it("E-9: an ended Live schedule is not copied into the publish form", () => {
    const admin = src("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(admin).toMatch(/const ended = Boolean\(e\.endAt && Date\.parse\(e\.endAt\) < Date\.now\(\)\);/);
    expect(admin).toContain('startLocal: !ended && e.startAt ? isoToManilaLocal(e.startAt) : ""');
  });
  it("E-10: community purchase duplicate check includes paused (migration)", () => {
    const sql = src("supabase/migrations/20271103230000_ads_r1_community_promotion_paused_dup.sql");
    expect(sql).toContain("order_status IN (''pending_review'', ''active'', ''paused'')");
    expect(sql).toContain("RAISE EXCEPTION");
  });
});
