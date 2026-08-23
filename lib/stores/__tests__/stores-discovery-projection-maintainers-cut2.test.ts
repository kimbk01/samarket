import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823160000_stores_discovery_projection_maintainers_cut2.sql"
);

describe("stores discovery projection maintainers CUT 2 migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("defines timestamp-rolling popularity ledger (not calendar-day discovery authority)", () => {
    expect(sql).toContain("store_order_popularity_ledger");
    expect(sql).toMatch(/created_at >= now\(\)-30d|created_at >= p_since/i);
    expect(sql).toContain("apply_store_order_popularity_ledger");
    expect(sql).toContain("expire_store_order_popularity_ledger_batch");
    expect(sql).toContain("ON CONFLICT (order_id) DO NOTHING");
  });

  it("keeps ST_Buffer in single RPC authority", () => {
    expect(sql).toContain("upsert_store_delivery_coverage");
    expect(sql).toContain("ST_Buffer");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.upsert_store_delivery_coverage[\s\S]*TO service_role/);
  });

  it("defines dual-version global rebuild lifecycle RPCs", () => {
    expect(sql).toContain("begin_delivery_coverage_global_rebuild");
    expect(sql).toContain("mark_delivery_coverage_rebuild_progress");
    expect(sql).toContain("try_flip_delivery_coverage_active_version");
    expect(sql).toContain("rebuild_status");
    expect(sql).toContain("rebuild_failed_store_ids");
    expect(sql).toContain("rebuild_cursor_store_id");
  });

  it("flips active version only when complete with zero failures", () => {
    expect(sql).toMatch(/rebuild_failed_count <> 0/);
    expect(sql).toMatch(/rebuild_processed < v_row\.rebuild_expected/);
    expect(sql).toContain("active_policy_version = v_row.building_policy_version");
  });

  it("retains bounded previous coverage version on flip", () => {
    expect(sql).toMatch(/DELETE FROM public\.store_delivery_coverage[\s\S]*policy_version < v_row\.building_policy_version - 1/);
  });

  it("marks daily stats as auxiliary reconcile only", () => {
    expect(sql).toContain("upsert_store_order_daily_stat_on_completed");
    expect(sql).toContain("NOT discovery read authority");
  });

  it("locks RPCs to service_role", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.apply_store_order_popularity_ledger[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.begin_delivery_coverage_global_rebuild\(\) FROM PUBLIC, anon, authenticated/);
  });
});
