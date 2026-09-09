/**
 * CUT 1 — Prelaunch Reset Coin finance gate contract.
 * Proves canonical Coin tables, phantom exclusion, and fail-closed on query error.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENCY_AUTHORITY } from "@/lib/currency/currency-ssot-hard-lock";
import { PRELAUNCH_RESET_DOMAIN_INVENTORY } from "@/lib/admin/prelaunch-reset/domain-inventory";
import { PRELAUNCH_RESET_SELECTIVE_MATRIX } from "@/lib/admin/prelaunch-reset/selective-scopes";
import {
  COIN_FINANCE_UNREADABLE_BLOCKER,
  PRELAUNCH_RESET_COIN_ACCOUNT_TABLE,
  PRELAUNCH_RESET_COIN_LEDGER_TABLE,
  PRELAUNCH_RESET_COIN_PHANTOM_TABLES,
  countCanonicalCoinFinanceRows,
  resolveCoinFinanceGate,
} from "@/lib/admin/prelaunch-reset/coin-finance-gate";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

function mockCountClient(opts: {
  table: string;
  n?: number;
  error?: { message: string } | null;
}) {
  return {
    from(table: string) {
      expect(table).toBe(opts.table);
      return {
        select() {
          return {
            in() {
              return Promise.resolve({
                count: opts.error ? null : (opts.n ?? 0),
                error: opts.error ?? null,
              });
            },
          };
        },
      };
    },
  };
}

describe("CUT 1 Prelaunch Coin finance gate", () => {
  it("canonical Coin authority matches Currency SSOT", () => {
    expect(PRELAUNCH_RESET_COIN_LEDGER_TABLE).toBe(CURRENCY_AUTHORITY.COIN.ledgerTable);
    expect(PRELAUNCH_RESET_COIN_ACCOUNT_TABLE).toBe(CURRENCY_AUTHORITY.COIN.balanceTable);
    expect(PRELAUNCH_RESET_COIN_LEDGER_TABLE).toBe("store_economic_point_ledger");
    expect(PRELAUNCH_RESET_COIN_ACCOUNT_TABLE).toBe("store_economic_point_accounts");
  });

  it("runtime prelaunch-reset sources do not reference phantom business_coin_*", () => {
    const planner = read("lib/admin/prelaunch-reset/planner.ts");
    const inventory = read("lib/admin/prelaunch-reset/domain-inventory.ts");
    const scopes = read("lib/admin/prelaunch-reset/selective-scopes.ts");
    const gate = read("lib/admin/prelaunch-reset/coin-finance-gate.ts");

    for (const src of [planner, inventory, scopes]) {
      expect(src).not.toMatch(/business_coin_ledger/);
      expect(src).not.toMatch(/business_coin_accounts/);
      expect(src).not.toMatch(/dbOwner:\s*"business_coin_\*"/);
    }
    expect(planner).toContain("countCanonicalCoinFinanceRows");
    expect(planner).toContain("resolveCoinFinanceGate");
    expect(gate).toContain("CURRENCY_AUTHORITY.COIN");
    expect(gate).toContain("PRELAUNCH_RESET_COIN_LEDGER_TABLE");
    // Phantom names may appear only as explicit exclusion list
    for (const phantom of PRELAUNCH_RESET_COIN_PHANTOM_TABLES) {
      expect(gate).toContain(phantom);
    }
  });

  it("domain inventory + selective matrix declare canonical Coin tables", () => {
    const coinInv = PRELAUNCH_RESET_DOMAIN_INVENTORY.find((r) => r.id === "COIN");
    expect(coinInv?.tablesHint).toEqual([
      "store_economic_point_accounts",
      "store_economic_point_ledger",
    ]);
    expect(coinInv?.protectedDefault).toBe(true);
    expect(coinInv?.resetEligibleDefault).toBe(false);

    const coinScope = PRELAUNCH_RESET_SELECTIVE_MATRIX.find((r) => r.key === "coin");
    expect(coinScope?.dbOwner).toContain("store_economic_point_ledger");
    expect(coinScope?.dbOwner).toContain("store_economic_point_accounts");
    expect(coinScope?.support).toBe("BLOCKED");
  });

  it("CASE A — zero Coin ledger → no finance delta / no Coin blocker", async () => {
    const sb = mockCountClient({ table: "store_economic_point_ledger", n: 0 });
    const counted = await countCanonicalCoinFinanceRows(sb as never, ["store-a"]);
    expect(counted).toEqual({ n: 0 });
    const gate = resolveCoinFinanceGate(counted);
    expect(gate.financeDelta).toBe(0);
    expect(gate.blocker).toBeNull();
    expect(gate.guard).toBeNull();
  });

  it("CASE B — Coin ledger rows → finance delta (reset must block via finance_rows)", async () => {
    const sb = mockCountClient({ table: "store_economic_point_ledger", n: 3 });
    const counted = await countCanonicalCoinFinanceRows(sb as never, ["store-a"]);
    expect(counted.n).toBe(3);
    const gate = resolveCoinFinanceGate(counted);
    expect(gate.financeDelta).toBe(3);
    expect(gate.blocker).toBeNull();
    expect(gate.guard).toBe("coin_ledger_rows=3");
  });

  it("CASE C — Coin query error → fail-closed blocker (never SAFE)", async () => {
    const sb = mockCountClient({
      table: "store_economic_point_ledger",
      error: { message: "relation does not exist" },
    });
    const counted = await countCanonicalCoinFinanceRows(sb as never, ["store-a"]);
    expect(counted.n).toBe(0);
    expect(counted.error).toMatch(/store_economic_point_ledger/);
    const gate = resolveCoinFinanceGate(counted);
    expect(gate.financeDelta).toBe(0);
    expect(gate.blocker).toBe(COIN_FINANCE_UNREADABLE_BLOCKER);
    expect(gate.guard).toMatch(/^coin_query_error=/);
    // Explicit: error must not resolve as empty-safe
    expect(gate.blocker).not.toBeNull();
  });

  it("empty storeIds short-circuits without query", async () => {
    const sb = {
      from() {
        throw new Error("must not query");
      },
    };
    await expect(countCanonicalCoinFinanceRows(sb as never, [])).resolves.toEqual({ n: 0 });
  });
});
