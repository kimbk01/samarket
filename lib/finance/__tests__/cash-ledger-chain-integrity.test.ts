import { describe, expect, it } from "vitest";
import {
  findCashLedgerChainBreaks,
  partitionCashLedgerBreaks,
  signedCashAmountMinor,
} from "@/lib/finance/cash-ledger-chain-integrity";
import {
  CASH_DIRECT_BALANCE_MUTATION_FORBIDDEN,
  CASH_LEDGER_AMOUNT_IS_CASH_MOVED,
  POINT_FUNGIBILITY_CONTRACT,
  assertCurrencySsotHardLockAnchors,
} from "@/lib/currency/currency-ssot-hard-lock";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("POINT fungibility + F-02 cash integrity anchors", () => {
  it("locks fungible Point without purchased/reward wallets", () => {
    expect(POINT_FUNGIBILITY_CONTRACT.singleWallet).toBe(true);
    expect(POINT_FUNGIBILITY_CONTRACT.separatePurchasedRewardWallets).toBe(false);
    expect(POINT_FUNGIBILITY_CONTRACT.giftSpendSourceGate).toBe("NONE");
    expect(assertCurrencySsotHardLockAnchors()).toBe(true);
  });

  it("locks cash amount = moved + forbids direct balance mutation", () => {
    expect(CASH_LEDGER_AMOUNT_IS_CASH_MOVED).toBe(true);
    expect(CASH_DIRECT_BALANCE_MUTATION_FORBIDDEN).toBe(true);
  });

  it("chain walker detects QA-style SALE_FEE break as HISTORICAL_EXCEPTION", () => {
    expect(signedCashAmountMinor("debit", 2000)).toBe(-2000);
    const breaks = findCashLedgerChainBreaks([
      {
        entry_kind: "CONVERT_FROM_STORE_POINTS",
        direction: "credit",
        amount_minor: 10000,
        balance_after_minor: 39000,
      },
      {
        entry_kind: "SALE_FEE",
        direction: "debit",
        amount_minor: 2000,
        balance_after_minor: 0,
        idempotency_key: "sale_fee:order:qa",
      },
    ]);
    expect(breaks).toHaveLength(1);
    const parts = partitionCashLedgerBreaks(breaks);
    expect(parts.historical_exception).toHaveLength(1);
    expect(parts.unexplained).toHaveLength(0);
  });

  it("QA script no longer upserts business_cash_accounts", () => {
    const qa = readFileSync(
      resolve(process.cwd(), "scripts/qa/currency-cut-g-production-close.mjs"),
      "utf8"
    );
    expect(qa).not.toMatch(/business_cash_accounts["']\)\.upsert/);
    expect(qa).toContain("creditCashTopUpLedgered");
    expect(qa).toContain("ensureCashBalanceMinorLedgered");
  });

  it("F-02 migration revokes service_role account writes", () => {
    const mig = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20270118120000_finance_f02_cash_balance_writer_lock.sql"
      ),
      "utf8"
    );
    expect(mig).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.business_cash_accounts FROM service_role"
    );
  });
});
