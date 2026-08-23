import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { districtRank } from "@/lib/geo/haversine-km";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260823150000_stores_discovery_projection_schema_cut1.sql"
);

describe("stores discovery projection schema CUT 1 migration contract", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("requires PostGIS and creates versioned coverage schema", () => {
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS postgis");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    expect(sql).toContain("postgis extension unavailable");
    expect(sql).toContain("delivery_coverage_policy_state");
    expect(sql).toContain("active_policy_version");
    expect(sql).toContain("building_policy_version");
  });

  it("uses composite PK for dual-version coverage rows", () => {
    expect(sql).toMatch(/PRIMARY KEY\s*\(\s*store_id\s*,\s*policy_version\s*\)/);
    expect(sql).not.toMatch(/PRIMARY KEY\s*\(\s*store_id\s*\)/);
    expect(sql).toContain("dual-version rows not coexistent");
  });

  it("keeps lat/lng authority and adds location_geog projection owner", () => {
    expect(sql).toContain("LAT/LNG AUTHORITY");
    expect(sql).toContain("GEO QUERY PROJECTION");
    expect(sql).toContain("stores_compute_location_geog");
    expect(sql).toContain("trg_stores_sync_location_geog");
    expect(sql).toContain("trg_stores_sync_district_norm");
    expect(sql).toMatch(/GENERATED ALWAYS AS \(public\.stores_compute_location_geog\(lat, lng\)\)/);
  });

  it("defines district_norm as lower(trim(district)) without prefix-only semantics", () => {
    expect(sql).toMatch(
      /district_norm[\s\S]*lower\(btrim\(coalesce\(district, ''\)\)\)/
    );
    expect(sql).not.toContain("district_prefix");
  });

  it("creates GiST index compatible with ST_Covers membership shape", () => {
    expect(sql).toContain("idx_store_delivery_coverage_geog_gist");
    expect(sql).toContain("USING gist (coverage_geog)");
    expect(sql).toContain("ST_Covers(coverage_geog, origin_geog)");
  });

  it("adds schedule and order projection columns without backfill jobs", () => {
    expect(sql).toContain("discovery_schedule_state");
    expect(sql).toContain("next_schedule_transition_at");
    expect(sql).toContain("'ORDERABLE'");
    expect(sql).toContain("'IN_BREAK'");
    expect(sql).toContain("'CLOSED'");
    expect(sql).toContain("'PREPARING'");
    expect(sql).toContain("'UNKNOWN'");
    expect(sql).toContain("store_order_daily_stats");
    expect(sql).toContain("completed_orders_30d integer NOT NULL DEFAULT 0");
    expect(sql).not.toMatch(/ST_Buffer/i);
    expect(sql).not.toMatch(/get_store_completed_order_counts/i);
  });

  it("locks down RLS and revokes public/authenticated on projection tables", () => {
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.store_delivery_coverage FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON TABLE public.store_order_daily_stats FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_delivery_coverage TO service_role");
  });

  it("district_norm matches districtRank normalization inputs", () => {
    expect(districtRank("Makati Central", "makati")).toBe(1);
    expect(districtRank("makati", "makati")).toBe(0);
    expect(districtRank("Quezon City", "Manila")).toBe(2);

    const norm = (value: string | null) => (value ?? "").trim().toLowerCase();
    expect(norm(" Makati ")).toBe("makati");
    expect(norm(null)).toBe("");
  });
});
