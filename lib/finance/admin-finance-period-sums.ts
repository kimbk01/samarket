/**
 * 관리자 재무 화면 기간 계산 합계 (재감사 C-1 · Owner 「코인 전환 얼마? 코인 출금 얼마??」 2026-11-03).
 * DB 함수가 목록과 **같은 조건 전체**(현재 쪽이 아님)로 계산한 합계를 화면 칸으로 바꾼다. 순수 · 클라이언트 공용.
 * SQL 짝: supabase/migrations/20271104150000_admin_finance_period_sums.sql
 */
import {
  financeFundingRailLabel,
  financeStatusLabel,
  financeTypeLabel,
  formatFinanceAmount,
  type FinanceWallet,
} from "@/lib/finance/presentation";
import { catalogPair } from "@/lib/i18n/catalog-pair";

export type AdminFinanceSumCell = {
  key: string;
  label: string;
  /** 금액 표시 (부호 = 잔액 증감) · null = 금액 없음(건수만) */
  amount: string | null;
  count: number;
  /** 칸 아래 작은 설명 */
  note?: string | null;
};

const toNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ─── 통합 거래 · Coin 전환 ─────────────────────────────────────────────────

export type UnifiedTxKindSum = {
  wallet: "CASH" | "COIN" | "POINT";
  entryKind: string;
  direction: "credit" | "debit";
  count: number;
  /** Cash = minor(부호 없음, 방향은 direction) · Coin/Point = 부호 있는 수량 */
  amount: number;
  /** Coin→Cash 전환(Cash 입금 줄)의 차감 Coin 합 */
  coinOut: number;
};

/**
 * [서버 전용 입력] RPC `sums_by_kind`(DB 이름) → 화면용 배열. 없으면(구 DB 함수) null.
 * 화면은 이 함수를 쓰지 않는다 — API 응답은 이미 화면용 이름이므로 `readUnifiedTxSums` 로 읽는다(실기 A-1 FAIL 2026-11-04).
 */
export function unifiedTxSumsFromRpc(raw: unknown): UnifiedTxKindSum[] | null {
  if (!Array.isArray(raw)) return null;
  const out: UnifiedTxKindSum[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const wallet = String(r.wallet ?? "").toUpperCase();
    if (wallet !== "CASH" && wallet !== "COIN" && wallet !== "POINT") continue;
    out.push({
      wallet,
      entryKind: String(r.entry_kind ?? ""),
      direction: r.direction === "credit" ? "credit" : "debit",
      count: Math.trunc(toNum(r.count)),
      amount: toNum(r.amount),
      coinOut: toNum(r.coin_out),
    });
  }
  return out;
}

/** [화면] API 응답 `sumsByKind`(화면용 이름 · 서버가 `unifiedTxSumsFromRpc` 로 만든 값) 확인해 읽기. 모양이 다르면 null(합계 줄 숨김). */
export function readUnifiedTxSums(raw: unknown): UnifiedTxKindSum[] | null {
  if (!Array.isArray(raw)) return null;
  const out: UnifiedTxKindSum[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    const wallet = String(r.wallet ?? "").toUpperCase();
    if ((wallet !== "CASH" && wallet !== "COIN" && wallet !== "POINT") || typeof r.entryKind !== "string") return null;
    out.push({
      wallet,
      entryKind: r.entryKind,
      direction: r.direction === "credit" ? "credit" : "debit",
      count: Math.trunc(toNum(r.count)),
      amount: toNum(r.amount),
      coinOut: toNum(r.coinOut),
    });
  }
  return out;
}

const WALLET_ORDER: Record<UnifiedTxKindSum["wallet"], number> = { CASH: 0, COIN: 1, POINT: 2 };

function signedFinanceAmount(wallet: FinanceWallet, signed: number, isMinor: boolean): string {
  const abs = formatFinanceAmount({ wallet, amount: Math.abs(signed), isMinor });
  if (signed > 0) return `+${abs}`;
  if (signed < 0) return `−${abs}`;
  return abs;
}

/**
 * 종류별 칸 — 같은 지갑·종류의 입·출을 한 칸으로(부호 = 잔액 증감).
 * Coin 출금 지급 줄(WITHDRAWAL_COMPLETE)은 원장 금액이 0 이다(Coin 은 신청 때 차감) — 건수만 보이고 설명을 단다.
 */
export function unifiedTxSumCells(sums: readonly UnifiedTxKindSum[], ko: boolean): AdminFinanceSumCell[] {
  const merged = new Map<string, { wallet: UnifiedTxKindSum["wallet"]; kind: string; signed: number; count: number }>();
  for (const s of sums) {
    const key = `${s.wallet}:${s.entryKind}`;
    const signed = s.wallet === "CASH" ? (s.direction === "credit" ? 1 : -1) * Math.abs(s.amount) : s.amount;
    const cur = merged.get(key) ?? { wallet: s.wallet, kind: s.entryKind, signed: 0, count: 0 };
    cur.signed += signed;
    cur.count += s.count;
    merged.set(key, cur);
  }
  return [...merged.values()]
    .sort((a, b) => WALLET_ORDER[a.wallet] - WALLET_ORDER[b.wallet] || a.kind.localeCompare(b.kind))
    .map((m) => {
      const zeroMarker = m.wallet === "COIN" && m.kind === "WITHDRAWAL_COMPLETE";
      return {
        key: `${m.wallet}:${m.kind}`,
        label: `${m.wallet === "CASH" ? "Cash" : m.wallet === "COIN" ? "Coin" : "Point"} · ${financeTypeLabel(m.kind, ko)}`,
        amount: zeroMarker ? null : signedFinanceAmount(m.wallet, m.signed, m.wallet === "CASH"),
        count: m.count,
        note: zeroMarker
          ? ko
            ? "Coin 은 출금 신청 때 차감됨"
            : "Coin is deducted at request"
          : null,
      };
    });
}

/** Coin 전환 화면 한 칸 — 「전환 n건 · Coin x → Cash ₱y」 (CONVERT_FROM_STORE_POINTS 줄 기준). */
export function conversionSumCells(sums: readonly UnifiedTxKindSum[], ko: boolean): AdminFinanceSumCell[] {
  let count = 0;
  let cashMinor = 0;
  let coin = 0;
  for (const s of sums) {
    if (s.wallet !== "CASH" || s.entryKind !== "CONVERT_FROM_STORE_POINTS") continue;
    count += s.count;
    cashMinor += Math.abs(s.amount);
    coin += Math.abs(s.coinOut);
  }
  return [
    {
      key: "coin_out",
      label: ko ? "전환한 Coin" : "Coin converted",
      amount: formatFinanceAmount({ wallet: "COIN", amount: coin }),
      count,
    },
    {
      key: "cash_in",
      label: ko ? "받은 Cash" : "Cash credited",
      amount: formatFinanceAmount({ wallet: "CASH", amount: cashMinor, isMinor: true }),
      count,
    },
  ];
}

// ─── 광고 지출 ─────────────────────────────────────────────────────────────

export type AdFundingSourceSum = { source: string; status: string; count: number; amount: number };

/** [서버 전용 입력] RPC `sums_by_source` → 화면용 배열. 화면은 `readAdFundingSums`. */
export function adFundingSumsFromRpc(raw: unknown): AdFundingSourceSum[] | null {
  if (!Array.isArray(raw)) return null;
  return (raw as Array<Record<string, unknown>>).map((r) => ({
    source: String(r.source ?? ""),
    status: String(r.status ?? ""),
    count: Math.trunc(toNum(r.count)),
    amount: toNum(r.amount),
  }));
}

/** [화면] API 응답 `sumsBySource` 읽기 (서버가 만든 화면용 값). 모양이 다르면 null. */
export function readAdFundingSums(raw: unknown): AdFundingSourceSum[] | null {
  if (!Array.isArray(raw)) return null;
  const out: AdFundingSourceSum[] = [];
  for (const r of raw as Array<Record<string, unknown>>) {
    if (typeof r.source !== "string" || typeof r.status !== "string") return null;
    out.push({ source: r.source, status: r.status, count: Math.trunc(toNum(r.count)), amount: toNum(r.amount) });
  }
  return out;
}

/** 출처 → 결제 수단·금액 단위 (load-ad-funding-trace-page 의 행 변환과 같은 대응) */
const AD_SOURCE_RAIL: Record<string, { rail: string; wallet: FinanceWallet; isMinor: boolean; product: { ko: string; en: string } }> = {
  delivery_ad_canonical_bc_fundings: { rail: "STORE_CASH", wallet: "CASH", isMinor: true, product: catalogPair("finance_store_ads") },
  feed_ad_requests: { rail: "MEMBER_POINT", wallet: "POINT", isMinor: false, product: catalogPair("finance_feed_ads") },
  point_promotion_orders: { rail: "MEMBER_POINT", wallet: "POINT", isMinor: false, product: catalogPair("finance_promotion") },
  platform_popup_campaigns: { rail: "ADMIN_DIRECT", wallet: "N_A", isMinor: false, product: catalogPair("finance_admin_popup") },
};

const AD_SOURCE_ORDER = Object.keys(AD_SOURCE_RAIL);

export function adFundingSumCells(sums: readonly AdFundingSourceSum[], ko: boolean): AdminFinanceSumCell[] {
  return [...sums]
    .sort(
      (a, b) =>
        AD_SOURCE_ORDER.indexOf(a.source) - AD_SOURCE_ORDER.indexOf(b.source) || a.status.localeCompare(b.status)
    )
    .map((s) => {
      const meta = AD_SOURCE_RAIL[s.source];
      const product = meta ? (ko ? meta.product.ko : meta.product.en) : s.source;
      const rail = meta ? financeFundingRailLabel(meta.rail, ko) : "";
      return {
        key: `${s.source}:${s.status}`,
        label: `${product} (${rail}) · ${financeStatusLabel(s.status, ko)}`,
        amount:
          meta && meta.wallet !== "N_A"
            ? formatFinanceAmount({ wallet: meta.wallet, amount: s.amount, isMinor: meta.isMinor })
            : null,
        count: s.count,
      };
    });
}

// ─── 미납 수수료 ───────────────────────────────────────────────────────────

export type OutstandingSums = {
  count: number;
  dueMinor: number;
  paidMinor: number;
  outstandingMinor: number;
};

/** [서버 전용 입력] RPC `admin_finance_outstanding_sums`(DB 이름) → 화면용. 화면은 `readOutstandingSums`(실기 A-5 FAIL 2026-11-04). */
export function outstandingSumsFromRpc(raw: unknown): OutstandingSums | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.count == null) return null;
  return {
    count: Math.trunc(toNum(o.count)),
    dueMinor: toNum(o.due_minor),
    paidMinor: toNum(o.paid_minor),
    outstandingMinor: toNum(o.outstanding_minor),
  };
}

/** [화면] API 응답 `sums`(화면용 이름) 읽기. 모양이 다르면 null. */
export function readOutstandingSums(raw: unknown): OutstandingSums | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.count == null || o.dueMinor == null || o.paidMinor == null || o.outstandingMinor == null) return null;
  return {
    count: Math.trunc(toNum(o.count)),
    dueMinor: toNum(o.dueMinor),
    paidMinor: toNum(o.paidMinor),
    outstandingMinor: toNum(o.outstandingMinor),
  };
}

/** 칸 이름 = 표 열 이름 그대로(관리자 회계 용어 유지 · Owner 2026-11-03) — Fee Due · Cash Paid · Remaining */
export function outstandingSumCells(s: OutstandingSums, ko: boolean): AdminFinanceSumCell[] {
  const cash = (minor: number) => formatFinanceAmount({ wallet: "CASH", amount: minor, isMinor: true });
  return [
    { key: "due", label: ko ? "Fee Due" : "Fee due", amount: cash(s.dueMinor), count: s.count },
    { key: "paid", label: ko ? "Cash Paid" : "Cash paid", amount: cash(s.paidMinor), count: s.count },
    { key: "remaining", label: "Remaining", amount: cash(s.outstandingMinor), count: s.count },
  ];
}

/** 합계 머리글의 기간 글자 — 주소의 date/from/to 그대로(PHT 날짜). */
export function adminFinanceRangeText(
  input: { date?: string | null; from?: string | null; to?: string | null },
  ko: boolean
): string {
  if (String(input.date ?? "").toLowerCase() === "today") return ko ? "오늘" : "Today";
  const from = String(input.from ?? "").trim();
  const to = String(input.to ?? "").trim();
  if (from && !to) return from;
  if (from || to) return `${from || "…"} ~ ${to || "…"}`;
  return ko ? "전체 기간" : "All time";
}
