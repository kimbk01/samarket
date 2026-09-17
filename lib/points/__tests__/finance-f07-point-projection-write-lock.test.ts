import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COIN_REFUND_ECONOMIC_UNWIND_CONTRACT,
} from "@/lib/currency/currency-ssot-hard-lock";

const F07_MIG = readFileSync(
  join(process.cwd(), "supabase/migrations/20270118150000_finance_f07_point_projection_write_lock.sql"),
  "utf8"
);
const F07_ACL = readFileSync(
  join(process.cwd(), "supabase/migrations/20270118151000_finance_f07_point_column_acl_harden.sql"),
  "utf8"
);
const HARD_LOCK_DOC = readFileSync(
  join(process.cwd(), "docs/dibay-currency-ssot-hard-lock.md"),
  "utf8"
);
const LEDGER_TS = readFileSync(
  join(process.cwd(), "lib/points/user-point-ledger.ts"),
  "utf8"
);

describe("F-05 Coin refund economic unwind contract (doc lock)", () => {
  it("locks post-convert/withdraw refund as Coin REVERSAL with negative debt", () => {
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.postConversionRefund).toBe("COIN_REVERSAL");
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.postWithdrawalRefund).toBe("COIN_REVERSAL");
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.insufficientCoinOnRefund).toBe(
      "NEGATIVE_COIN_DEBT_ALLOWED"
    );
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.cashClawback).toBe(false);
    expect(COIN_REFUND_ECONOMIC_UNWIND_CONTRACT.orderToConversionProvenance).toBe(
      "NOT_REQUIRED_FUNGIBLE_COIN_POOL"
    );
    expect(HARD_LOCK_DOC).toContain("NEGATIVE_COIN_DEBT_ALLOWED");
    expect(HARD_LOCK_DOC).toContain("coin_reversal:order:{orderId}");
    expect(HARD_LOCK_DOC).toMatch(/Cash clawback[\s\S]*NO/);
  });
});

describe("F-07 point projection write lock", () => {
  it("forbids non-service_role points mutation in guard trigger", () => {
    expect(F07_MIG).toContain("profiles_points_direct_update_forbidden");
    expect(F07_MIG).toContain("NEW.points IS DISTINCT FROM OLD.points");
    expect(F07_MIG).toContain("jwt_role = 'service_role'");
    expect(F07_MIG).toContain("REVOKE UPDATE (points) ON TABLE public.profiles FROM authenticated");
    expect(F07_MIG).toContain("GRANT UPDATE (points) ON TABLE public.profiles TO service_role");
  });

  it("hardens authenticated UPDATE to column grants excluding points", () => {
    expect(F07_ACL).toContain("REVOKE UPDATE ON TABLE public.profiles FROM authenticated");
    expect(F07_ACL).toContain("attname IS DISTINCT FROM 'points'");
    expect(F07_ACL).toContain("GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated");
  });

  it("preserves ledger SSOT spend/credit and projection RPC", () => {
    expect(LEDGER_TS).toContain("sum_user_point_ledger");
    expect(LEDGER_TS).toContain("project_user_point_balance_from_ledger");
    expect(LEDGER_TS).toContain("sumUserPointLedger");
    expect(LEDGER_TS).toMatch(/current < cost/);
  });

  it("documents cache write lock on POINT authority", () => {
    expect(HARD_LOCK_DOC).toContain("project_user_point_balance_from_ledger");
    expect(HARD_LOCK_DOC).toMatch(/MUST NOT[\s\S]*UPDATE profiles\.points/);
  });
});
