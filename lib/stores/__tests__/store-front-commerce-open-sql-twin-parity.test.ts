/**
 * OPS-08 — resolveStoreFrontOpen (TS SSOT) 와 SQL 쌍둥이 public.store_front_commerce_open 이
 * 같은 고정 fixture 표를 만족해야 한다. SQL 쪽은 격리 DB 러너(supabase/tests/isolated/stage3-rpc/run.sh)가
 * 같은 JSON 을 읽어 검증한다. 여기서는 TS 판정 + 마이그레이션 계약(호출·ASCII 본문)을 고정한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStoreFrontOpen } from "@/lib/stores/store-auto-hours";

type Fixture = { name: string; hours: unknown; is_open: boolean | null; now: string; expected: boolean };

const root = process.cwd();
const fixtures = (
  JSON.parse(
    readFileSync(join(root, "supabase/tests/isolated/stage3-rpc/commerce-open-fixtures.json"), "utf8")
  ) as { cases: Fixture[] }
).cases;

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = sql.indexOf("$fn$", start);
  const close = sql.indexOf("$fn$", open + 4);
  return sql.slice(open + 4, close);
}

describe("OPS-08 store_front_commerce_open SQL twin parity", () => {
  it("fixture table is non-trivial (both outcomes, schedule/break/legacy covered)", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(40);
    expect(fixtures.some((f) => f.expected)).toBe(true);
    expect(fixtures.some((f) => !f.expected)).toBe(true);
    expect(new Set(fixtures.map((f) => f.name)).size).toBe(fixtures.length);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("TS resolveStoreFrontOpen: %s", (_n, f) => {
    expect(resolveStoreFrontOpen(f.hours, f.is_open, new Date(f.now))).toBe(f.expected);
  });

  it("SQL twin + order RPC migrations: ASCII bodies, RPC calls the twin last before Pass 2", () => {
    const twin = readFileSync(
      join(root, "supabase/migrations/20270604110000_store_front_commerce_open_sql_twin.sql"),
      "utf8"
    );
    const rpc = readFileSync(
      join(root, "supabase/migrations/20270604110100_create_store_order_atomic_ops08_loc004.sql"),
      "utf8"
    );
    for (const body of [
      fnBody(twin, "store_front_hhmm_to_minutes"),
      fnBody(twin, "store_front_commerce_open"),
      fnBody(rpc, "create_store_order_atomic"),
    ]) {
      expect(/[^\x00-\x7F]/.test(body)).toBe(false);
    }
    const body = fnBody(rpc, "create_store_order_atomic");
    const gate = body.indexOf("public.store_front_commerce_open(v_store.business_hours_json, v_store.is_open, now())");
    const pass2 = body.indexOf("-- Pass 2+: mutate inside subtransaction");
    const payment = body.indexOf("-- ROOT A: payment authority before mutate");
    expect(gate).toBeGreaterThan(payment);
    expect(pass2).toBeGreaterThan(gate);
    expect(body).toContain("'store_pickup_disabled'");
    expect(body).toContain("'store_delivery_disabled'");
  });
});
