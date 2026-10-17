"use client";

/**
 * Shared Admin + Owner commission ledger UI — one component set, one wording.
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  formatCashMinorSigned,
  STORE_CASH_ORDER_GATE_LABEL,
  STORE_COMMISSION_ROW_STATE_CHIP,
  STORE_COMMISSION_ROW_STATE_LABEL,
  type StoreCashPosition,
  type StoreCommissionRowState,
} from "@/lib/stores/commission/store-commission-contract";
import type {
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";

export type CommissionLang = "ko" | "en";

export function pickCommissionCopy(lang: CommissionLang, ko: string, en: string): string {
  return lang === "ko" ? ko : en;
}

export function formatCashMinor(minor: number): string {
  return formatCashMinorSigned(minor, (php) => formatMoneyPhp(php));
}

export function CommissionStateChip({ state, lang }: { state: StoreCommissionRowState; lang: CommissionLang }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${STORE_COMMISSION_ROW_STATE_CHIP[state]}`}
    >
      {STORE_COMMISSION_ROW_STATE_LABEL[state][lang]}
    </span>
  );
}

function Tile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "good" | "warn";
  hint?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "good"
        ? "text-emerald-800"
        : tone === "warn"
          ? "text-amber-800"
          : "text-sam-fg";
  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 sam-text-xxs text-sam-meta">{hint}</p> : null}
    </div>
  );
}

/** 캐시 잔액 · 미납 수수료 · 순잔액(마이너스) · 주문 접수 상태. */
export function StoreCashPositionCard({ position, lang }: { position: StoreCashPosition; lang: CommissionLang }) {
  const negative = position.netMinor < 0;
  return (
    <div className="space-y-2" data-store-cash-position={position.storeId}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label={pickCommissionCopy(lang, "캐시 잔액", "Cash balance")} value={formatCashMinor(position.balanceMinor)} />
        <Tile
          label={pickCommissionCopy(lang, "미납 수수료", "Unpaid commission")}
          value={formatCashMinor(position.outstandingMinor)}
          tone={position.outstandingMinor > 0 ? "danger" : "default"}
        />
        <Tile
          label={pickCommissionCopy(lang, "순잔액 (잔액 − 미납)", "Net (balance − unpaid)")}
          value={formatCashMinor(position.netMinor)}
          tone={negative ? "danger" : "good"}
        />
      </div>
      <p
        className={`rounded-ui-rect px-3 py-2 sam-text-helper font-medium ${
          position.orderable ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
        }`}
        role="status"
      >
        {position.orderable
          ? pickCommissionCopy(lang, "신규 주문 접수 가능", "Accepting new orders")
          : pickCommissionCopy(
              lang,
              "캐시 부족으로 신규 주문이 차단되었습니다. 캐시를 충전하면 미납 수수료가 먼저 정산되고 순잔액이 0보다 크면 자동으로 다시 열립니다.",
              "New orders are blocked (insufficient Cash). A top-up settles unpaid commission first; ordering reopens automatically once net is above 0."
            )}
        <span className="ml-1 sam-text-xxs font-normal opacity-80">
          · {pickCommissionCopy(lang, "정책", "Policy")}: {STORE_CASH_ORDER_GATE_LABEL[position.gateMode][lang]}
        </span>
      </p>
    </div>
  );
}

export function CommissionSummaryGrid({
  summary,
  lang,
}: {
  summary: StoreCommissionLedgerSummary;
  lang: CommissionLang;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={pickCommissionCopy(lang, "수수료 부과", "Commission charged")}
          value={formatCashMinor(summary.feeChargedMinor)}
          hint={pickCommissionCopy(lang, `${summary.count}건 · 기준액 ${formatMoneyPhp(summary.commissionBasePhp)}`, `${summary.count} orders · base ${formatMoneyPhp(summary.commissionBasePhp)}`)}
        />
        <Tile
          label={pickCommissionCopy(lang, "캐시에서 차감됨", "Paid from Cash")}
          value={formatCashMinor(summary.feePaidMinor)}
          tone="good"
        />
        <Tile
          label={pickCommissionCopy(lang, "미납 (캐시 부족)", "Unpaid (short Cash)")}
          value={formatCashMinor(summary.feeOutstandingMinor)}
          tone={summary.feeOutstandingMinor > 0 ? "danger" : "default"}
        />
        <Tile
          label={pickCommissionCopy(lang, "취소·환불 검토 대기", "Awaiting review")}
          value={`${summary.reviewCount}${pickCommissionCopy(lang, "건", "")}`}
          tone={summary.reviewCount > 0 ? "warn" : "default"}
          hint={formatCashMinor(summary.reviewFeeMinor)}
        />
        <Tile
          label={pickCommissionCopy(lang, "캐시로 환급", "Refunded to Cash")}
          value={formatCashMinor(summary.cashRefundedMinor)}
        />
        <Tile
          label={pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")}
          value={formatCashMinor(summary.outstandingCancelledMinor)}
        />
        <Tile
          label={pickCommissionCopy(lang, "순 수수료 (부과 − 환급 − 미납취소)", "Net commission")}
          value={formatCashMinor(summary.netCommissionMinor)}
        />
      </div>
      <p className={`sam-text-xxs ${summary.reconciles ? "text-sam-muted" : "font-semibold text-red-700"}`}>
        {summary.reconciles
          ? pickCommissionCopy(lang, "검증: 부과 = 차감 + 미납 + 환급 + 미납취소 ✓", "Check: charged = paid + unpaid + refunded + cancelled ✓")
          : pickCommissionCopy(lang, "검증 불일치 — 레거시 자동 환급 행이 포함되어 있습니다.", "Mismatch — includes legacy auto-reversed rows.")}
      </p>
    </div>
  );
}

/** Row money line — identical numbers on Admin and Owner. */
export function CommissionRowMoney({ row, lang }: { row: StoreCommissionLedgerRow; lang: CommissionLang }) {
  const rate = row.feePercent != null ? ` (${row.feePercent}%)` : "";
  return (
    <div className="sam-text-xxs text-sam-muted tabular-nums">
      <p>
        {pickCommissionCopy(lang, "기준액", "Base")} {formatMoneyPhp(row.commissionBasePhp)} ·{" "}
        {pickCommissionCopy(lang, "수수료", "Fee")} {formatCashMinor(row.feeChargedMinor)}
        {rate}
      </p>
      <p>
        {pickCommissionCopy(lang, "캐시 차감", "Paid")} {formatCashMinor(row.feePaidMinor)} ·{" "}
        {pickCommissionCopy(lang, "미납", "Unpaid")} {formatCashMinor(row.feeOutstandingMinor)}
        {row.cashRefundedMinor > 0
          ? ` · ${pickCommissionCopy(lang, "환급", "Refunded")} ${formatCashMinor(row.cashRefundedMinor)}`
          : ""}
        {row.outstandingCancelledMinor > 0
          ? ` · ${pickCommissionCopy(lang, "미납취소", "Cancelled")} ${formatCashMinor(row.outstandingCancelledMinor)}`
          : ""}
      </p>
      <p>
        {row.chargeStage === "preparing"
          ? pickCommissionCopy(lang, "조리 시작 시 차감", "Charged at cooking start")
          : pickCommissionCopy(lang, "완료 시 차감(레거시)", "Charged at completion (legacy)")}{" "}
        · {row.chargedAt.slice(0, 16).replace("T", " ")}
      </p>
      {row.adjustmentNote ? (
        <p className="mt-1 rounded-ui-rect bg-sam-surface-muted px-2 py-1 text-sam-fg">
          {pickCommissionCopy(lang, "처리 메모", "Decision note")}: {row.adjustmentNote}
        </p>
      ) : null}
    </div>
  );
}

export const COMMISSION_STATE_FILTERS: ReadonlyArray<StoreCommissionRowState | "all"> = [
  "all",
  "review_required",
  "outstanding",
  "charged",
  "refunded",
  "kept",
];

export function commissionFilterLabel(state: StoreCommissionRowState | "all", lang: CommissionLang): string {
  return state === "all" ? pickCommissionCopy(lang, "전체", "All") : STORE_COMMISSION_ROW_STATE_LABEL[state][lang];
}
