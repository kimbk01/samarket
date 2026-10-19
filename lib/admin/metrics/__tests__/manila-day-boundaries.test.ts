import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  manilaDateKey,
  manilaLastNDaysRangeUtc,
  manilaTodayRangeUtc,
  rebucketUtcHoursToManila,
} from "@/lib/admin/metrics/manila-period";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const MIGRATION = "supabase/migrations/20270519120000_delivery_ops_stats_manila_day_boundaries.sql";

describe("Manila day boundaries — delivery ops stats", () => {
  it("2026-10-18T16:30:00Z belongs to Manila 2026-10-19; 15:30Z belongs to 2026-10-18", () => {
    expect(manilaDateKey("2026-10-18T16:30:00Z")).toBe("2026-10-19");
    expect(manilaDateKey("2026-10-18T15:30:00Z")).toBe("2026-10-18");
    expect(manilaDateKey("2026-10-18T16:00:00Z")).toBe("2026-10-19");
    expect(manilaDateKey(null)).toBeNull();
  });

  it("today range starts at Manila midnight (16:00Z previous UTC day)", () => {
    const at1630 = manilaTodayRangeUtc(new Date("2026-10-18T16:30:00Z"));
    expect(at1630).toEqual({ fromIso: "2026-10-18T16:00:00.000Z", toIso: "2026-10-19T16:00:00.000Z" });
    const at1530 = manilaTodayRangeUtc(new Date("2026-10-18T15:30:00Z"));
    expect(at1530).toEqual({ fromIso: "2026-10-17T16:00:00.000Z", toIso: "2026-10-18T16:00:00.000Z" });
  });

  it("last-N-days range is N Manila calendar days ending today (inclusive)", () => {
    const r = manilaLastNDaysRangeUtc(14, new Date("2026-10-18T16:30:00Z"));
    expect(r.todayStartIso).toBe("2026-10-18T16:00:00.000Z");
    expect(r.todayEndExIso).toBe("2026-10-19T16:00:00.000Z");
    expect(r.rangeStartIso).toBe("2026-10-05T16:00:00.000Z");
    expect(manilaDateKey(r.rangeStartIso)).toBe("2026-10-06");
    const one = manilaLastNDaysRangeUtc(1, new Date("2026-10-18T15:30:00Z"));
    expect(one.rangeStartIso).toBe(one.todayStartIso);
    expect(manilaDateKey(one.todayStartIso)).toBe("2026-10-18");
  });

  it("stats APIs use Manila range helper, not server-local setHours", () => {
    for (const f of ["app/api/admin/stats/delivery-operations/route.ts", "app/api/admin/ops-console/summary/route.ts"]) {
      const src = read(f);
      expect(src).toContain("manilaLastNDaysRangeUtc(days)");
      expect(src).not.toMatch(/setHours\(0,\s*0,\s*0,\s*0\)/);
    }
  });

  it("hourly chart: RPC stays UTC hours and the client rebuckets once (no double conversion)", () => {
    // 마이그레이션은 시간대별 식을 건드리지 않는다 (UTC 시 유지 → 클라이언트 1회 변환).
    expect(read(MIGRATION)).not.toContain("extract(hour");
    expect(rebucketUtcHoursToManila([{ hour: 16, count: 3 }])[0].count).toBe(3);
    const page = read("components/admin/delivery-operations/DeliveryOperationsDashboardPage.tsx");
    expect(page.match(/rebucketUtcHoursToManila\(/g)?.length).toBe(1);
  });

  it("UI no longer advertises UTC-midnight day split", () => {
    const cat = read("lib/i18n/catalog/admin-delivery-r4-field-monitoring.ts");
    expect(cat).not.toContain("UTC 자정");
    expect(cat).not.toContain("UTC midnight");
  });
});

describe("SQL contract — migration buckets days in Asia/Manila", () => {
  const sql = read(MIGRATION);

  it("replaces only the three daily bucket expressions, in place", () => {
    for (const col of ["so.created_at", "so.refunded_at", "ss.created_at"]) {
      expect(sql).toContain(`date_trunc('day', ${col} at time zone 'UTC')`);
      expect(sql).toContain(`date_trunc('day', ${col} at time zone 'Asia/Manila')`);
    }
    // 시간대별 차트(orders_by_hour_utc)는 건드리지 않는다.
    expect(sql).not.toContain("extract(hour");
  });

  it("keeps the live definition (signature, SECURITY DEFINER, grants) — no rewritten body", () => {
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("admin_delivery_operations_dashboard(timestamptz, timestamptz, timestamptz, timestamptz)");
    expect(sql).not.toMatch(/create or replace function/i);
    expect(sql).toContain("execute v_new");
  });
});
