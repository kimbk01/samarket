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

/**
 * 같은 시각(created_at 동일)에 기록된 행은 DB 정렬 순서가 실제 기록 순서와 다를 수 있다.
 * 같은 시각 묶음 안에서는 직전 잔액 ± 금액 = balance_after 가 맞는 행을 먼저 놓는다 (금액·행은 바꾸지 않음).
 */
export function orderCashLedgerRowsForChain<T extends CashLedgerChainRow>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const out: T[] = [];
  let prev: number | null = null;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].created_at === sorted[i].created_at) j += 1;
    const group = sorted.slice(i, j);
    while (group.length > 0) {
      let pick = 0;
      if (prev !== null) {
        const fit = group.findIndex(
          (r) => prev! + signedCashAmountMinor(r.direction, r.amount_minor) === Math.trunc(Number(r.balance_after_minor) || 0)
        );
        if (fit >= 0) pick = fit;
      }
      const [r] = group.splice(pick, 1);
      out.push(r);
      prev = Math.trunc(Number(r.balance_after_minor) || 0);
    }
    i = j;
  }
  return out;
}

export type CashLedgerIntegrityBreak = CashLedgerChainBreak & {
  id: string | null;
  created_at: string | null;
  /** 조사 메모일 뿐 정상 판정이 아니다 — 불일치(FAIL)는 그대로 유지한다. */
  suspected_cause: "qa_direct_balance_write_pattern" | null;
};

/**
 * P0-6 — 매장 Cash 원장 무결성 (관리자 감사 표시용).
 * FAIL 조건: 원장 연쇄(after = before ± amount) 끊김, 또는 계정 잔액 ≠ 원장 합계, 또는 계정 잔액 ≠ 마지막 balance_after.
 * 과거 QA 직접 잔액 변경 의심 패턴도 FAIL 로 남기고 suspected_cause 로만 표시한다 (예외로 숨기지 않음).
 */
export type CashLedgerIntegrityReport = {
  /** UNAVAILABLE = 잔액 또는 원장을 읽지 못함 (PASS 로 대체 금지). */
  status: "PASS" | "FAIL" | "UNAVAILABLE";
  rowCount: number;
  balanceMinor: number | null;
  ledgerSumMinor: number;
  lastAfterMinor: number | null;
  balanceVsLedgerSumDiffMinor: number | null;
  balanceVsLastAfterDiffMinor: number | null;
  breaks: CashLedgerIntegrityBreak[];
  truncated: boolean;
};

export function buildCashLedgerIntegrityReport(input: {
  balanceMinor: number | null;
  rows: Array<CashLedgerChainRow & { id?: string }>;
  truncated?: boolean;
}): CashLedgerIntegrityReport {
  const ordered = orderCashLedgerRowsForChain(input.rows);
  const rawBreaks = findCashLedgerChainBreaks(ordered);
  const breaks: CashLedgerIntegrityBreak[] = rawBreaks.map((b) => {
    const row = ordered[b.index];
    return {
      ...b,
      id: row?.id ?? null,
      created_at: row?.created_at ?? null,
      suspected_cause: isHistoricalQaCashBalancePollutionBreak(b) ? "qa_direct_balance_write_pattern" : null,
    };
  });
  const ledgerSumMinor = ordered.reduce((s, r) => s + signedCashAmountMinor(r.direction, r.amount_minor), 0);
  const last = ordered.length > 0 ? Math.trunc(Number(ordered[ordered.length - 1].balance_after_minor) || 0) : null;
  const bal = input.balanceMinor;
  const sumDiff = bal == null ? null : bal - ledgerSumMinor;
  const lastDiff = bal == null || last == null ? null : bal - last;
  const fail = breaks.length > 0 || (sumDiff != null && sumDiff !== 0) || (lastDiff != null && lastDiff !== 0);
  return {
    status: bal == null ? "UNAVAILABLE" : fail ? "FAIL" : "PASS",
    rowCount: ordered.length,
    balanceMinor: bal,
    ledgerSumMinor,
    lastAfterMinor: last,
    balanceVsLedgerSumDiffMinor: sumDiff,
    balanceVsLastAfterDiffMinor: lastDiff,
    breaks,
    truncated: input.truncated === true,
  };
}
