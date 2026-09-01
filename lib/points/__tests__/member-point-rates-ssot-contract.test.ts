import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  computeAppliedRate,
  totalPointsFromPlanRow,
} from "@/lib/points/point-plan-shared";

describe("member point rates SSOT", () => {
  it("computeAppliedRate = totalPoints / paymentAmount", () => {
    expect(computeAppliedRate(1000, 1000)).toBe(1);
    expect(computeAppliedRate(5250, 5000)).toBe(1.05);
    expect(computeAppliedRate(1000, 0)).toBe(0);
  });

  it("totalPoints includes bonus", () => {
    expect(totalPointsFromPlanRow({ point_amount: 5000, bonus_amount: 250 })).toBe(5250);
  });

  it("approve RPC uses request.point_amount only (no plan re-read for amount)", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261018150000_member_point_ledger_only_project.sql"),
      "utf8"
    );
    expect(sql).toContain("v_req.point_amount");
    expect(sql).not.toMatch(/FROM\s+public\.point_plans/i);
    expect(sql).not.toMatch(/JOIN\s+public\.point_plans/i);
  });

  it("rates snapshot migration adds rate_version and applied_rate", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261018160000_member_point_rates_ssot_snapshot.sql"),
      "utf8"
    );
    expect(sql).toContain("point_plans");
    expect(sql).toContain("rate_version");
    expect(sql).toContain("applied_rate");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.point_plans");
    expect(sql).not.toMatch(/STORE_POINT_CHARGE_PAYMENT_RATIO/);
    expect(sql).not.toMatch(/\bstore_point_ledger\b|\bstore_point_charge\b/);
  });

  it("charge route snapshots applied_rate and rate_version", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/api/me/points/charge/route.ts"),
      "utf8"
    );
    expect(src).toContain("computeAppliedRate");
    expect(src).toContain("applied_rate:");
    expect(src).toContain("rate_version:");
  });

  it("hub bumps rate_version on rate field change", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/points/member-point-plans.ts"),
      "utf8"
    );
    expect(src).toContain("POINT_PLAN_RATE_FIELDS");
    expect(src).toContain("rate_version");
    expect(src).toContain("Math.max(1, Number(cur.rate_version");
  });

});
