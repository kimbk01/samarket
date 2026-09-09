/**
 * CUT 4 — Prelaunch safety-critical count fail-closed (cash/point/orders).
 * ERROR → ZERO must not yield SAFE. Gift optional path preserved. Coin CUT1 untouched.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COIN_FINANCE_UNREADABLE_BLOCKER,
  FINANCE_AUTHORITY_UNREADABLE_BLOCKER,
  countCanonicalCoinFinanceRows,
  resolveCoinFinanceGate,
  resolveFinanceProtectionCountGate,
} from "@/lib/admin/prelaunch-reset/coin-finance-gate";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("CUT 4 Prelaunch finance count fail-closed", () => {
  it("CASE A — ZERO success → no blocker / delta 0", () => {
    const gate = resolveFinanceProtectionCountGate({ n: 0 }, { guardPrefix: "cash_ledger" });
    expect(gate.delta).toBe(0);
    expect(gate.blocker).toBeNull();
    expect(gate.guard).toBeNull();
  });

  it("CASE B — NON-ZERO success → delta only (aggregate finance_rows still blocks in planner)", () => {
    const gate = resolveFinanceProtectionCountGate({ n: 4 }, { guardPrefix: "cash_ledger" });
    expect(gate.delta).toBe(4);
    expect(gate.blocker).toBeNull();
    expect(gate.guard).toBeNull();
  });

  it("CASE C — QUERY ERROR → fail-closed (never SAFE zero)", () => {
    const gate = resolveFinanceProtectionCountGate(
      { n: 0, error: "business_cash_ledger:relation does not exist" },
      { guardPrefix: "cash_ledger" }
    );
    expect(gate.delta).toBe(0);
    expect(gate.blocker).toBe(FINANCE_AUTHORITY_UNREADABLE_BLOCKER);
    expect(gate.guard).toMatch(/^cash_ledger_query_error=/);
  });

  it("CASE D — PERMISSION ERROR → fail-closed", () => {
    const gate = resolveFinanceProtectionCountGate(
      { n: 0, error: "point_charge_requests:permission denied" },
      { guardPrefix: "point_charge_requests" }
    );
    expect(gate.blocker).toBe(FINANCE_AUTHORITY_UNREADABLE_BLOCKER);
    expect(gate.delta).toBe(0);
  });

  it("CASE E — unknown count without error stays known delta (no invent)", () => {
    const gate = resolveFinanceProtectionCountGate({ n: 0 }, { guardPrefix: "store_orders" });
    expect(gate).toEqual({ delta: 0, blocker: null, guard: null });
  });

  it("planner wires cash/point/orders through fail-closed gate; gift stays optional warning", () => {
    const planner = read("lib/admin/prelaunch-reset/planner.ts");
    expect(planner).toContain("resolveFinanceProtectionCountGate");
    expect(planner).toContain("cash_ledger");
    expect(planner).toContain("cash_charge_requests");
    expect(planner).toContain("point_charge_requests");
    expect(planner).toContain("store_orders");
    expect(planner).toContain("gift_optional:");
    // Must not treat cash error as warnings-only anymore
    expect(planner).not.toMatch(
      /cashLedger\.error\)\s*warnings\.push/
    );
  });

  it("CUT1 Coin gate preserved (regression)", async () => {
    const sb = {
      from(table: string) {
        expect(table).toBe("store_economic_point_ledger");
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  count: null,
                  error: { message: "timeout" },
                });
              },
            };
          },
        };
      },
    };
    const counted = await countCanonicalCoinFinanceRows(sb as never, ["s1"]);
    const gate = resolveCoinFinanceGate(counted);
    expect(gate.blocker).toBe(COIN_FINANCE_UNREADABLE_BLOCKER);
    expect(FINANCE_AUTHORITY_UNREADABLE_BLOCKER).not.toBe(COIN_FINANCE_UNREADABLE_BLOCKER);
  });
});
