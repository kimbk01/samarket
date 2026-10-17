"use client";

/**
 * Shared Admin + Owner commission / Cash ledger UI — one component set, one wording.
 * Every number shown here comes from the server (SQL); components only format.
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  BUSINESS_CASH_LEDGER_KIND_LABEL,
  BUSINESS_CASH_LEDGER_KINDS,
  formatCashMinorSigned,
  isBusinessCashLedgerKind,
  STORE_CASH_ORDER_GATE_LABEL,
  STORE_COMMISSION_DECISION_LABEL,
  STORE_COMMISSION_FILTER_LABEL,
  STORE_COMMISSION_ROW_STATE_CHIP,
  STORE_COMMISSION_ROW_STATE_LABEL,
  type BusinessCashLedgerKind,
  type StoreCashPosition,
  type StoreCommissionLedgerFilterState,
  type StoreCommissionRowState,
} from "@/lib/stores/commission/store-commission-contract";
import type {
  StoreCashLedgerPage,
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { STORE_COMMISSION_PERIODS, type StoreCommissionPeriod } from "@/lib/stores/commission/store-commission-ledger-query";

export type CommissionLang = "ko" | "en";

export function pickCommissionCopy(lang: CommissionLang, ko: string, en: string): string {
  return lang === "ko" ? ko : en;
}

export function formatCashMinor(minor: number): string {
  return formatCashMinorSigned(minor, (php) => formatMoneyPhp(php));
}

function formatTs(iso: string | null | undefined): string {
  const t = String(iso ?? "").trim();
  return t ? `${t.slice(0, 16).replace("T", " ")} UTC` : "—";
}

export const chipClass = (active: boolean) =>
  active
    ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
    : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted";

export function CommissionStateChip({ state, lang }: { state: StoreCommissionRowState; lang: CommissionLang }) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 sam-text-xxs font-semibold ${STORE_COMMISSION_ROW_STATE_CHIP[state]}`}>
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
    tone === "danger" ? "text-red-700" : tone === "good" ? "text-emerald-800" : tone === "warn" ? "text-amber-800" : "text-sam-fg";
  return (
    <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className={`text-base font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 sam-text-xxs text-sam-meta">{hint}</p> : null}
    </div>
  );
}

/** 캐시 잔액 · 미납 수수료 · 순잔액(마이너스) · 신규 주문 접수 상태. */
export function StoreCashPositionCard({ position, lang }: { position: StoreCashPosition; lang: CommissionLang }) {
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
          tone={position.netMinor < 0 ? "danger" : "good"}
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
              "순잔액이 0 이하라 신규 주문이 차단되었습니다. 이미 받은 주문은 정상 처리됩니다. 캐시를 충전하면 미납 수수료가 먼저 정산되고, 순잔액이 0보다 커지는 즉시 다시 열립니다.",
              "New orders are blocked (net <= 0). Orders already received continue normally. A top-up settles unpaid commission first; ordering reopens as soon as net is above 0."
            )}
        <span className="ml-1 sam-text-xxs font-normal opacity-80">
          · {pickCommissionCopy(lang, "정책", "Policy")}: {STORE_CASH_ORDER_GATE_LABEL[position.gateMode][lang]}
        </span>
      </p>
    </div>
  );
}

export function CommissionSummaryGrid({ summary, lang }: { summary: StoreCommissionLedgerSummary; lang: CommissionLang }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={pickCommissionCopy(lang, "수수료 부과", "Commission charged")}
          value={formatCashMinor(summary.feeChargedMinor)}
          hint={pickCommissionCopy(
            lang,
            `${summary.count}건 · 기준액 ${formatMoneyPhp(summary.commissionBasePhp)}`,
            `${summary.count} orders · base ${formatMoneyPhp(summary.commissionBasePhp)}`
          )}
        />
        <Tile label={pickCommissionCopy(lang, "캐시에서 차감됨", "Paid from Cash")} value={formatCashMinor(summary.feePaidMinor)} tone="good" />
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
        <Tile label={pickCommissionCopy(lang, "캐시로 환급", "Refunded to Cash")} value={formatCashMinor(summary.cashRefundedMinor)} />
        <Tile label={pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")} value={formatCashMinor(summary.outstandingCancelledMinor)} />
        <Tile
          label={pickCommissionCopy(lang, "순 수수료 (부과 − 환급 − 미납취소)", "Net commission")}
          value={formatCashMinor(summary.netCommissionMinor)}
        />
      </div>
      <p className={`sam-text-xxs ${summary.reconciles ? "text-sam-muted" : "font-semibold text-red-700"}`}>
        {summary.reconciles
          ? pickCommissionCopy(lang, "대사: 부과 = 차감 + 미납 + 환급 + 미납취소 ✓ (서버 계산)", "Check: charged = paid + unpaid + refunded + cancelled ✓ (server)")
          : pickCommissionCopy(lang, "대사 불일치 — 원부과액 미상 레거시 행 포함", "Mismatch — includes legacy rows with unknown original fee")}
      </p>
    </div>
  );
}

export function CommissionRowMoney({ row, lang }: { row: StoreCommissionLedgerRow; lang: CommissionLang }) {
  const rate = row.feePercent != null ? ` (${row.feePercent}%)` : "";
  const d = row.decision;
  return (
    <div className="sam-text-xxs text-sam-muted tabular-nums">
      <p>
        {pickCommissionCopy(lang, "기준액", "Base")} {formatMoneyPhp(row.commissionBasePhp)} · {pickCommissionCopy(lang, "수수료", "Fee")}{" "}
        {formatCashMinor(row.feeChargedMinor)}
        {rate}
      </p>
      <p>
        {pickCommissionCopy(lang, "캐시 차감", "Paid")} {formatCashMinor(row.feePaidMinor)} · {pickCommissionCopy(lang, "미납", "Unpaid")}{" "}
        {formatCashMinor(row.feeOutstandingMinor)}
      </p>
      <p>
        {pickCommissionCopy(lang, "부과 시점", "Charged at")}: {row.chargeStage} · {formatTs(row.chargedAt)}
      </p>
      {d ? (
        <div className="mt-1 rounded-ui-rect bg-sam-surface-muted px-2 py-1 text-sam-fg">
          <p className="font-medium">
            {STORE_COMMISSION_DECISION_LABEL[d.decision][lang]} · {formatTs(d.decidedAt)}
          </p>
          <p>
            {pickCommissionCopy(lang, "승인액", "Approved")} {formatCashMinor(d.approvedMinor)} = {pickCommissionCopy(lang, "캐시 환급", "Cash")}{" "}
            {formatCashMinor(d.cashRefundMinor)} + {pickCommissionCopy(lang, "미납 취소", "unpaid cancelled")} {formatCashMinor(d.outstandingCancelMinor)}
          </p>
          <p>
            {pickCommissionCopy(lang, "사유", "Reason")}: {d.reason}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function CommissionFilterChips({
  value,
  onChange,
  lang,
  reviewCount,
}: {
  value: StoreCommissionLedgerFilterState;
  onChange: (s: StoreCommissionLedgerFilterState) => void;
  lang: CommissionLang;
  reviewCount?: number;
}) {
  const states: StoreCommissionLedgerFilterState[] = ["all", "review_required", "outstanding", "charged", "decided"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {states.map((s) => (
        <button key={s} type="button" className={chipClass(value === s)} onClick={() => onChange(s)}>
          {STORE_COMMISSION_FILTER_LABEL[s][lang]}
          {s === "review_required" && reviewCount ? ` ${reviewCount}` : ""}
        </button>
      ))}
    </div>
  );
}

const PERIOD_LABEL: Record<StoreCommissionPeriod, { ko: string; en: string }> = {
  all: { ko: "전체 기간", en: "All time" },
  today: { ko: "오늘", en: "Today" },
  this_week: { ko: "이번 주", en: "This week" },
  this_month: { ko: "이번 달", en: "This month" },
  custom: { ko: "기간 지정", en: "Custom" },
};

export function CommissionPeriodFilter({
  period,
  fromDay,
  toDay,
  onChange,
  lang,
}: {
  period: StoreCommissionPeriod;
  fromDay: string;
  toDay: string;
  onChange: (next: { period: StoreCommissionPeriod; fromDay: string; toDay: string }) => void;
  lang: CommissionLang;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {STORE_COMMISSION_PERIODS.map((p) => (
        <button key={p} type="button" className={chipClass(period === p)} onClick={() => onChange({ period: p, fromDay, toDay })}>
          {PERIOD_LABEL[p][lang]}
        </button>
      ))}
      {period === "custom" ? (
        <>
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-helper"
            value={fromDay}
            onChange={(e) => onChange({ period, fromDay: e.target.value, toDay })}
            aria-label="from"
          />
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 sam-text-helper"
            value={toDay}
            onChange={(e) => onChange({ period, fromDay, toDay: e.target.value })}
            aria-label="to"
          />
        </>
      ) : null}
      <span className="sam-text-xxs text-sam-meta">{pickCommissionCopy(lang, "기준: UTC", "Basis: UTC")}</span>
    </div>
  );
}

export function CashLedgerKindChips({
  value,
  onChange,
  lang,
}: {
  value: BusinessCashLedgerKind[];
  onChange: (k: BusinessCashLedgerKind[]) => void;
  lang: CommissionLang;
}) {
  const toggle = (k: BusinessCashLedgerKind) =>
    onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k]);
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className={chipClass(value.length === 0)} onClick={() => onChange([])}>
        {pickCommissionCopy(lang, "전체 유형", "All types")}
      </button>
      {BUSINESS_CASH_LEDGER_KINDS.map((k) => (
        <button key={k} type="button" className={chipClass(value.includes(k))} onClick={() => toggle(k)}>
          {BUSINESS_CASH_LEDGER_KIND_LABEL[k][lang]}
        </button>
      ))}
    </div>
  );
}

/** Cash history — period balance + rows (identical on Admin and Owner). */
export function CashLedgerView({
  page,
  lang,
  showStore,
}: {
  page: StoreCashLedgerPage;
  lang: CommissionLang;
  showStore: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-4">
        <Tile label={pickCommissionCopy(lang, "기간 시작 잔액(원장)", "Opening (ledger)")} value={formatCashMinor(page.openingMinor)} />
        <Tile label={pickCommissionCopy(lang, "입금 합계", "Credits")} value={formatCashMinor(page.creditMinor)} tone="good" />
        <Tile label={pickCommissionCopy(lang, "출금 합계", "Debits")} value={formatCashMinor(page.debitMinor)} tone="danger" />
        <Tile label={pickCommissionCopy(lang, "기간 종료 잔액(원장)", "Closing (ledger)")} value={formatCashMinor(page.closingMinor)} />
      </div>
      {page.ledgerMismatchStoreIds.length > 0 ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-helper text-red-800" role="alert">
          {pickCommissionCopy(
            lang,
            `원장 합계와 현재 잔액이 다른 매장 ${page.ledgerMismatchStoreIds.length}곳 — 과거에 원장 밖에서 잔액이 변경된 이력이 있습니다. 운영팀 확인 전까지 기간 잔액은 원장 기준 값입니다.`,
            `${page.ledgerMismatchStoreIds.length} store(s): ledger sum ≠ live balance (balance changed outside the ledger in the past). Period balances shown are ledger-based.`
          )}
        </p>
      ) : null}
      {page.rows.length === 0 ? (
        <p className="sam-text-body text-sam-muted">{pickCommissionCopy(lang, "거래 내역이 없습니다.", "No transactions.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sam-text-xxs text-sam-muted">
              <tr>
                <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "시각", "Time")}</th>
                {showStore ? <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "매장", "Store")}</th> : null}
                <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "유형", "Type")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "금액", "Amount")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "거래 후 잔액", "Balance after")}</th>
                <th className="py-1.5">{pickCommissionCopy(lang, "거래 ID", "Tx ID")}</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id} className="border-t border-sam-border-soft">
                  <td className="py-1.5 pr-3 sam-text-xxs text-sam-muted">{formatTs(r.createdAt)}</td>
                  {showStore ? <td className="py-1.5 pr-3">{r.storeName || r.storeId.slice(0, 8)}</td> : null}
                  <td className="py-1.5 pr-3">
                    {isBusinessCashLedgerKind(r.kind) ? BUSINESS_CASH_LEDGER_KIND_LABEL[r.kind][lang] : r.kind}
                  </td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${r.direction === "credit" ? "text-emerald-800" : "text-red-700"}`}>
                    {formatCashMinor(r.direction === "credit" ? r.amountMinor : -r.amountMinor)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatCashMinor(r.balanceAfterMinor)}</td>
                  <td className="py-1.5 sam-text-xxs text-sam-meta">{r.id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function LedgerPager({
  offset,
  pageSize,
  total,
  loading,
  onChange,
  lang,
}: {
  offset: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onChange: (offset: number) => void;
  lang: CommissionLang;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="mt-3 flex items-center justify-between sam-text-helper">
      <button
        type="button"
        className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-50"
        disabled={offset === 0 || loading}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
      >
        {pickCommissionCopy(lang, "이전", "Prev")}
      </button>
      <span className="text-sam-muted">
        {offset + 1}–{Math.min(offset + pageSize, total)} / {total}
      </span>
      <button
        type="button"
        className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-50"
        disabled={offset + pageSize >= total || loading}
        onClick={() => onChange(offset + pageSize)}
      >
        {pickCommissionCopy(lang, "다음", "Next")}
      </button>
    </div>
  );
}

export type CommissionTab = "overview" | "ledger" | "review" | "decided" | "cash";

export const COMMISSION_TAB_LABEL: Record<CommissionTab, { ko: string; en: string }> = {
  overview: { ko: "매장별 현황", en: "Stores" },
  ledger: { ko: "수수료 원장", en: "Commission ledger" },
  review: { ko: "취소·환불 검토", en: "Cancel/refund review" },
  decided: { ko: "조정 이력", en: "Decision history" },
  cash: { ko: "캐시 거래", en: "Cash transactions" },
};

/** Tab → ledger filter state (review/decided tabs are fixed filters of the same ledger). */
export function tabLedgerState(tab: CommissionTab, chosen: StoreCommissionLedgerFilterState): StoreCommissionLedgerFilterState {
  if (tab === "review") return "review_required";
  if (tab === "decided") return "decided";
  return chosen;
}
