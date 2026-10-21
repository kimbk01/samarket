/**
 * OPS-03 x OPS-08 — TS resolveStoreFrontOpen 과 SQL 쌍둥이 public.store_front_commerce_open
 * (20270604120200 이 요일별·휴무일 규칙으로 CREATE OR REPLACE) 가 같은 fixture 표를 만족한다.
 * SQL 쪽은 격리 DB 러너 supabase/tests/isolated/stage3-3b/run.sh 가 같은 JSON 으로 검증한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";
import { STORE_FRONT_COMMERCE_FIXTURES } from "@/lib/stores/__tests__/fixtures/store-front-commerce-fixture-table";

type Fixture = { name: string; hours: unknown; is_open: boolean | null; now: string; expected: boolean };

const root = process.cwd();
const weekly = (
  JSON.parse(
    readFileSync(join(root, "supabase/tests/isolated/stage3-3b/commerce-open-weekly-fixtures.json"), "utf8")
  ) as { cases: Fixture[] }
).cases;

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("$fn$", start);
  const close = sql.indexOf("$fn$", open + 4);
  return sql.slice(open + 4, close);
}

describe("OPS-03 weekly / closed dates — SQL twin parity table", () => {
  it("covers every case of the TS fixture table (same expected open/closed)", () => {
    expect(weekly.length).toBeGreaterThanOrEqual(STORE_FRONT_COMMERCE_FIXTURES.length);
    expect(new Set(weekly.map((f) => f.name)).size).toBe(weekly.length);
    for (const f of STORE_FRONT_COMMERCE_FIXTURES) {
      const name = "ops03_" + f.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
      const c = weekly.find((x) => x.name === name);
      expect(c, name).toBeDefined();
      expect(c!.expected).toBe(f.open);
      expect(new Date(c!.now).getTime()).toBe(new Date(f.at).getTime());
    }
  });

  it.each(weekly.map((f) => [f.name, f] as const))("TS resolveStoreFrontOpen: %s", (_n, f) => {
    expect(resolveStoreFrontOpen(f.hours, f.is_open, new Date(f.now))).toBe(f.expected);
  });

  it("migration bodies are ASCII and the twin delegates day intervals to the helper", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20270604120200_store_front_commerce_open_weekly_closed_dates.sql"),
      "utf8"
    );
    for (const name of ["store_front_day_intervals", "store_front_commerce_open"]) {
      expect(/[^\x00-\x7F]/.test(fnBody(sql, name))).toBe(false);
    }
    expect(fnBody(sql, "store_front_commerce_open")).toContain("public.store_front_day_intervals(");
  });
});
