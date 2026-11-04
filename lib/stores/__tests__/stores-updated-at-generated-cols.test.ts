import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D1 (실기 2026-11-04 R3-3) — `stores_set_updated_at` 비교에 생성 열이 섞이면 시스템 열만 바꾸는 UPDATE
 * (저장 응답 뒤 영업 상태 투영 등)도 updated_at 을 올려 사장님 화면 재저장이 409 로 막힌다.
 */
const MIGRATION = "supabase/migrations/20271105120000_stores_updated_at_ignore_generated_cols.sql";
const PREV_SYSTEM_COLS = [
  "updated_at",
  "delivery_policy_version",
  "discovery_schedule_state",
  "next_schedule_transition_at",
  "completed_orders_30d",
  "completed_orders_30d_at",
  "point_balance",
  "point_commerce_blocked",
  "point_block_reason",
  "point_warning_at",
  "rating_avg",
  "review_count",
];
const STORES_GENERATED_COLS = ["district_norm", "location_geog"];

function systemColsOf(sql: string): string[] {
  const m = sql.match(/v_system_cols text\[\] := ARRAY\[([\s\S]*?)\];/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}

describe("stores_set_updated_at — 생성 열 제외", () => {
  const sql = readFileSync(join(process.cwd(), MIGRATION), "utf8");
  const cols = systemColsOf(sql);

  it("생성 열(district_norm · location_geog)을 비교에서 뺀다", () => {
    for (const c of STORES_GENERATED_COLS) expect(cols).toContain(c);
  });

  it("기존 시스템 열은 그대로 유지한다", () => {
    for (const c of PREV_SYSTEM_COLS) expect(cols).toContain(c);
    expect(cols).toHaveLength(PREV_SYSTEM_COLS.length + STORES_GENERATED_COLS.length);
  });

  it("함수 본문만 바꾼다 (트리거 재생성·다른 객체 변경 없음)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.stores_set_updated_at\(\)/);
    expect(sql).not.toMatch(/DROP TRIGGER|CREATE TRIGGER|ALTER TABLE/);
  });
});
