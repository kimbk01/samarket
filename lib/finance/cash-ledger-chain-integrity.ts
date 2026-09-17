/**
 * Cash ledger chain integrity helpers (F-02).
 * amount_minor + direction = cash moved; balance_after must follow before ± amount.
 * Historical QA out-of-band balance upserts are HISTORICAL_EXCEPTION — do not rewrite rows.
 */
export type CashLedgerChainRow = {
  id?: string;
  entry_kind: string;
  direction: string;
  amount_minor: number;
  balance_after_minor: number;
  created_at?: string;
  idempotency_key?: string | null;
};

export type CashLedgerChainBreak = {
  index: number;
  entry_kind: string;
  direction: string;
  amount_minor: number;
  prev_after: number;
  expected_after: number;
  actual_after: number;
  delta: number;
  idempotency_key?: string | null;
};

/** Signed cash delta for one ledger row. */
export function signedCashAmountMinor(direction: string, amountMinor: number): number {
  const amt = Math.trunc(Number(amountMinor) || 0);
  return String(direction).toLowerCase() === "debit" ? -amt : amt;
}

/**
 * Walk ledger in created_at order. Returns breaks where after ≠ prev ± amount.
 * Does not invent repairs — callers classify HISTORICAL_EXCEPTION vs live writer bugs.
 */
export function findCashLedgerChainBreaks(rows: CashLedgerChainRow[]): CashLedgerChainBreak[] {
  const breaks: CashLedgerChainBreak[] = [];
  let prev: number | null = null;
  rows.forEach((r, index) => {
    const after = Math.trunc(Number(r.balance_after_minor) || 0);
    const signed = signedCashAmountMinor(r.direction, r.amount_minor);
    if (prev === null) {
      prev = after;
      return;
    }
    const expected = prev + signed;
    if (expected !== after) {
      breaks.push({
        index,
        entry_kind: String(r.entry_kind ?? ""),
        direction: String(r.direction ?? ""),
        amount_minor: Math.trunc(Number(r.amount_minor) || 0),
        prev_after: prev,
        expected_after: expected,
        actual_after: after,
        delta: after - expected,
        idempotency_key: r.idempotency_key ?? null,
      });
    }
    prev = after;
  });
  return breaks;
}

/** QA cut-g absolute upsert keys / pattern — historical pollution marker. */
export function isHistoricalQaCashBalancePollutionBreak(b: CashLedgerChainBreak): boolean {
  // Absolute set without ledger: large jump vs small SALE_FEE amount (cut-g pattern).
  if (b.entry_kind === "SALE_FEE" && Math.abs(b.delta) > b.amount_minor) return true;
  if (b.entry_kind === "SALE_FEE_SETTLEMENT" && b.prev_after === 0 && b.actual_after > 0) return true;
  return false;
}

export function partitionCashLedgerBreaks(breaks: CashLedgerChainBreak[]): {
  historical_exception: CashLedgerChainBreak[];
  unexplained: CashLedgerChainBreak[];
} {
  const historical_exception: CashLedgerChainBreak[] = [];
  const unexplained: CashLedgerChainBreak[] = [];
  for (const b of breaks) {
    if (isHistoricalQaCashBalancePollutionBreak(b)) historical_exception.push(b);
    else unexplained.push(b);
  }
  return { historical_exception, unexplained };
}
