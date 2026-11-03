import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tradeListLocationTier } from "@/lib/trade/marketplace/list-contract/trade-list-page.server";

/** 광고 감사 P-3 — TS 구간 계산이 DB 함수 `trade_list_page` 의 loc_pair·hood 규칙과 같아야 한다 */
describe("tradeListLocationTier mirrors trade_list_page", () => {
  const params = {
    loc_lgu: { L1: [0, 0] as [number, number] },
    loc_legacy: { "r1|c1": [1, 0] as [number, number] },
    loc_hood: { r: "r2", c: "c2", from: 2, to: 0 },
    loc_default: 2,
    loc_parts: ["", "", ""],
  };
  it("lgu id wins over region/city; unknown lgu → default (no legacy fallback)", () => {
    expect(tradeListLocationTier(params, { trade_lgu_id: "L1", region: "r1", city: "c1" })).toBe(0);
    expect(tradeListLocationTier(params, { trade_lgu_id: "ZZ", region: "r1", city: "c1" })).toBe(2);
  });
  it("legacy region|city when no lgu id", () => {
    expect(tradeListLocationTier(params, { trade_lgu_id: " ", region: "r1", city: "c1" })).toBe(1);
  });
  it("hood moves the matching default-tier region/city to its tier", () => {
    expect(tradeListLocationTier(params, { region: "r2", city: "c2" })).toBe(0);
    expect(tradeListLocationTier(params, { region: "r3", city: "c3" })).toBe(2);
  });
  it("SQL still has the same rule shape", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20271103160000_trade_sold_visible_window.sql"), "utf8");
    expect(sql).toContain("THEN v_loc_lgu -> btrim(b.trade_lgu_id)");
    expect(sql).toContain("ELSE v_loc_legacy -> (coalesce(btrim(b.region), '') || '|' || coalesce(btrim(b.city), ''))");
    expect(sql).toContain("jsonb_build_array(v_loc_default, 1e9)");
    expect(sql).toContain("THEN (v_hood ->> 'to')::int");
  });
});
