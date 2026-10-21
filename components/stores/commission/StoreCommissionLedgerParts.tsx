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
  STORE_PAYOUT_CLASS_LABEL,
  type BusinessCashLedgerKind,
  type StoreCashPosition,
  type StoreCommissionLedgerFilterState,
  type StoreCommissionRowState,
} from "@/lib/stores/commission/store-commission-contract";
import type {
  StoreCashLedgerPage,
  StoreCommissionBreakdownRow,
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
  StorePlatformPayablePage,
  StorePlatformPayableSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import {
  formatManilaDateTime,
  STORE_COMMISSION_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

export type CommissionLang = "ko" | "en";

export function pickCommissionCopy(lang: CommissionLang, ko: string, en: string): string {
  return lang === "ko" ? ko : en;
}

export function formatCashMinor(minor: number): string {
  return formatCashMinorSigned(minor, (php) => formatMoneyPhp(php));
}

/** Stored times are UTC; every screen shows Asia/Manila (same as period buckets). */
function formatTs(iso: string | null | undefined): string {
  const t = formatManilaDateTime(iso);
  return t === "—" ? t : `${t} PHT`;
}

/** Shared touch feedback for settlement controls (legacy pattern: active:scale + touch-manipulation). */
export const COMMISSION_PRESS =
  "touch-manipulation select-none transition-[background-color,border-color,transform,opacity] duration-150 active:scale-[0.97] disabled:scale-100";

export const chipClass = (active: boolean) =>
  active
    ? `inline-flex min-h-8 items-center rounded-full border border-signature bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white ${COMMISSION_PRESS}`
    : `inline-flex min-h-8 items-center rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted disabled:opacity-45 ${COMMISSION_PRESS}`;

/** Small secondary button inside table rows (상세 / 원장 보기). */
export const ROW_ACTION_BTN = `inline-flex min-h-9 items-center whitespace-nowrap rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted active:bg-sam-surface-muted ${COMMISSION_PRESS}`;

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
      {hint ? <p className="mt-0.5 sam-text-xxs text-sam-muted">{hint}</p> : null}
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
      <span className="sam-text-xxs text-sam-muted">{pickCommissionCopy(lang, "기준: 필리핀 시간 (UTC+8)", "Basis: Philippine time (UTC+8)")}</span>
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
                  <td className="py-1.5 sam-text-xxs text-sam-muted">{r.id.slice(0, 8)}</td>
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
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.floor(offset / pageSize) + 1);
  const shown = total === 0 ? 0 : Math.min(offset + pageSize, total) - offset;
  const btn = `inline-flex min-h-9 min-w-9 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-sam-fg active:bg-sam-surface-muted disabled:opacity-40 ${COMMISSION_PRESS}`;
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sam-text-helper" data-commission-pager="1">
      <span className="text-sam-muted">
        {pickCommissionCopy(
          lang,
          `전체 ${total.toLocaleString()}건 중 ${total === 0 ? 0 : offset + 1}–${offset + shown} (이 페이지 ${shown}건)`,
          `${total === 0 ? 0 : offset + 1}–${offset + shown} of ${total.toLocaleString()} (${shown} on this page)`
        )}
      </span>
      {pages > 1 ? (
        <div className="flex items-center gap-1.5">
          <button type="button" className={btn} disabled={page === 1 || loading} onClick={() => onChange(0)} aria-label="first page">
            «
          </button>
          <button type="button" className={btn} disabled={page === 1 || loading} onClick={() => onChange(Math.max(0, offset - pageSize))}>
            {pickCommissionCopy(lang, "이전", "Prev")}
          </button>
          <span className="px-1 tabular-nums text-sam-fg">
            {page} / {pages}
          </span>
          <button type="button" className={btn} disabled={page >= pages || loading} onClick={() => onChange(offset + pageSize)}>
            {pickCommissionCopy(lang, "다음", "Next")}
          </button>
          <button type="button" className={btn} disabled={page >= pages || loading} onClick={() => onChange((pages - 1) * pageSize)} aria-label="last page">
            »
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type CommissionTab = "ledger" | "review" | "cash" | "exceptions" | "payable";

/** A: 전체 거래 · B: 취소·환불 검토 · C: 매장 캐시 · D: 금융 예외 · 별도 레일: 플랫폼 지급 의무 */
export const COMMISSION_TAB_LABEL: Record<CommissionTab, { ko: string; en: string }> = {
  ledger: { ko: "전체 거래", en: "All transactions" },
  review: { ko: "취소·환불 검토", en: "Cancel/refund review" },
  cash: { ko: "매장 캐시", en: "Cash" },
  exceptions: { ko: "금융 예외", en: "Financial exceptions" },
  payable: { ko: "플랫폼 지급 의무", en: "Platform payable" },
};

export type CommissionReviewFilter = "review_required" | "approved" | "rejected" | "decided";
export const COMMISSION_REVIEW_FILTERS: readonly CommissionReviewFilter[] = ["review_required", "approved", "rejected", "decided"];

const REVIEW_FILTER_LABEL: Record<CommissionReviewFilter, { ko: string; en: string }> = {
  review_required: { ko: "검토 대기", en: "Awaiting review" },
  approved: { ko: "환급 승인", en: "Refund approved" },
  rejected: { ko: "환급 반려", en: "Refund rejected" },
  decided: { ko: "전체 결정", en: "All decisions" },
};

/** Tab → ledger filter state (the review tab is a fixed decision view of the same ledger). */
export function tabLedgerState(
  tab: CommissionTab,
  chosen: StoreCommissionLedgerFilterState,
  review: CommissionReviewFilter = "review_required"
): StoreCommissionLedgerFilterState {
  return tab === "review" ? review : chosen;
}

/** Current + legacy `?tab=` values (overview / decided) → tab + review filter. */
export function resolveCommissionTab(
  raw: string | null | undefined,
  allowed: readonly CommissionTab[]
): { tab: CommissionTab | null; review: CommissionReviewFilter | null } {
  const t = String(raw ?? "").trim();
  if (t === "decided") return { tab: allowed.includes("review") ? "review" : null, review: "decided" };
  if (t === "overview") return { tab: allowed.includes("cash") ? "cash" : null, review: null };
  return { tab: (allowed as readonly string[]).includes(t) ? (t as CommissionTab) : null, review: null };
}

export function CommissionReviewFilterChips({
  value,
  onChange,
  lang,
  reviewCount,
}: {
  value: CommissionReviewFilter;
  onChange: (v: CommissionReviewFilter) => void;
  lang: CommissionLang;
  reviewCount?: number;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="review filter">
      {COMMISSION_REVIEW_FILTERS.map((f) => (
        <button key={f} type="button" role="tab" aria-selected={value === f} className={chipClass(value === f)} onClick={() => onChange(f)}>
          {REVIEW_FILTER_LABEL[f][lang]}
          {f === "review_required" && reviewCount ? ` ${reviewCount}` : ""}
        </button>
      ))}
    </div>
  );
}

export type CommissionBreakdownGroup = "day" | "month" | "store";

const BREAKDOWN_GROUP_LABEL: Record<CommissionBreakdownGroup, { ko: string; en: string }> = {
  day: { ko: "일별", en: "Daily" },
  month: { ko: "월별", en: "Monthly" },
  store: { ko: "매장별", en: "By store" },
};

/** Day / month / store totals — buckets computed in SQL (Asia/Manila calendar). */
export function CommissionBreakdownTable({
  rows,
  group,
  groups,
  onGroupChange,
  lang,
}: {
  rows: StoreCommissionBreakdownRow[];
  group: CommissionBreakdownGroup;
  groups: readonly CommissionBreakdownGroup[];
  onGroupChange: (g: CommissionBreakdownGroup) => void;
  lang: CommissionLang;
}) {
  // Collapsed by default so the order ledger stays near the top; totals above already cover the period.
  return (
    <details className="group rounded-ui-rect border border-sam-border-soft bg-sam-surface" data-commission-breakdown="1">
      <summary className="cursor-pointer select-none px-3 py-2 sam-text-helper font-medium text-sam-fg">
        {pickCommissionCopy(
          lang,
          `기간별 합계 (${BREAKDOWN_GROUP_LABEL[group].ko} · ${rows.length}개 구간) — 펼치기`,
          `Period totals (${BREAKDOWN_GROUP_LABEL[group].en} · ${rows.length} buckets) — expand`
        )}
      </summary>
      <div className="border-t border-sam-border-soft p-3">
      <div className="flex flex-wrap gap-1.5">
        {groups.map((g) => (
          <button key={g} type="button" className={chipClass(group === g)} onClick={() => onGroupChange(g)}>
            {BREAKDOWN_GROUP_LABEL[g][lang]}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 sam-text-body text-sam-muted">{pickCommissionCopy(lang, "기간 내 부과 내역이 없습니다.", "No charges in this period.")}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="sam-text-xxs text-sam-muted">
              <tr>
                <th className="py-1.5 pr-3">{BREAKDOWN_GROUP_LABEL[group][lang]}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "건수", "Orders")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "수수료 기준 매출", "Commission base")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "부과", "Charged")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "캐시 차감", "Paid from Cash")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "미납", "Outstanding")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "환급·미납취소", "Refunded/cancelled")}</th>
                <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "순수수료", "Net commission")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.bucket} className="border-t border-sam-border-soft tabular-nums">
                  <td className="py-1.5 pr-3">{group === "store" ? r.label || r.bucket.slice(0, 8) : r.bucket}</td>
                  <td className="py-1.5 pr-3 text-right">{r.count}</td>
                  <td className="py-1.5 pr-3 text-right">{formatMoneyPhp(r.commissionBasePhp)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatCashMinor(r.feeChargedMinor)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatCashMinor(r.feePaidMinor)}</td>
                  <td className="py-1.5 pr-3 text-right text-red-700">{formatCashMinor(r.feeOutstandingMinor)}</td>
                  <td className="py-1.5 pr-3 text-right">{formatCashMinor(r.cashRefundedMinor + r.outstandingCancelledMinor)}</td>
                  <td className="py-1.5 pr-3 text-right font-semibold">{formatCashMinor(r.netCommissionMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </details>
  );
}

/**
 * Who holds the money for completed orders (Owner D-2 option A — separate rails):
 * platform → store = gift rail net (admin gift payout) + platform coupon (Coin). `payable` is the Coin
 * rail not yet minted; legacy `store_settlements` "scheduled" amounts are reference only, never payable.
 */
export function PlatformPayableSummaryGrid({ summary, lang }: { summary: StorePlatformPayableSummary; lang: CommissionLang }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile
          label={pickCommissionCopy(lang, "플랫폼 → 매장 지급 합계", "Platform owes stores (total)")}
          value={formatMoneyPhp(summary.platformOwesPhp)}
          hint={pickCommissionCopy(
            lang,
            `상품권 순액 ${formatMoneyPhp(summary.giftRailNetPhp)} + 쿠폰 Coin ${formatMoneyPhp(summary.coinDuePhp)}`,
            `Gift net ${formatMoneyPhp(summary.giftRailNetPhp)} + coupon Coin ${formatMoneyPhp(summary.coinDuePhp)}`
          )}
        />
        <Tile
          label={pickCommissionCopy(lang, "상품권 정산 레일 (순액)", "Gift rail payable (net)")}
          value={formatMoneyPhp(summary.giftRailNetPhp)}
          hint={pickCommissionCopy(
            lang,
            `${summary.giftRailOrders}건 · 사용 ${formatMoneyPhp(summary.giftRailPhp)} − 상품권 수수료 ${formatMoneyPhp(summary.giftFeePhp)} · 상품권 지급으로 정산 (현재 지급 가능 ${formatMoneyPhp(summary.giftRailAvailablePhp)} · 지급 완료 ${formatMoneyPhp(summary.giftRailPaidOutPhp)})`,
            `${summary.giftRailOrders} orders · redeemed ${formatMoneyPhp(summary.giftRailPhp)} − gift fee ${formatMoneyPhp(summary.giftFeePhp)} · paid via gift payout (available now ${formatMoneyPhp(summary.giftRailAvailablePhp)} · paid out ${formatMoneyPhp(summary.giftRailPaidOutPhp)})`
          )}
        />
        <Tile
          label={pickCommissionCopy(lang, "쿠폰 Coin 미적립", "Coupon Coin not yet credited")}
          value={formatMoneyPhp(summary.payablePhp)}
          tone={summary.payablePhp > 0 ? "warn" : "default"}
          hint={pickCommissionCopy(lang, `${summary.payableOrders}건`, `${summary.payableOrders} orders`)}
        />
        <Tile
          label={pickCommissionCopy(lang, "쿠폰 Coin 적립됨", "Coupon paid via Coin")}
          value={formatMoneyPhp(summary.heldPaidByCoinPhp)}
        />
        <Tile
          label={pickCommissionCopy(lang, "매장 직접 수령", "Collected by stores")}
          value={formatMoneyPhp(summary.directCollectedPhp)}
          hint={pickCommissionCopy(lang, "지급 대상 아님", "Not a payout")}
        />
        <Tile
          label={pickCommissionCopy(lang, "플랫폼 보유 (상품권·쿠폰 총액)", "Platform-held (gift/coupon gross)")}
          value={formatMoneyPhp(summary.platformHeldPhp)}
        />
      </div>
      <p className="sam-text-xxs text-sam-muted">
        {pickCommissionCopy(
          lang,
          `완료 주문 ${summary.orders}건 기준. 과거 정산 스냅샷 ${summary.legacyOpenSettlementCount}건 (${formatMoneyPhp(summary.legacyOpenSettlementPhp)})은 매장이 이미 직접 받은 금액이라 지급 의무가 아닙니다 (원본 보존). 과거 수동 지급 ${summary.legacyManualPaidCount}건 (${formatMoneyPhp(summary.legacyManualPaidPhp)})은 검토 대상입니다.`,
          `${summary.orders} completed orders. ${summary.legacyOpenSettlementCount} legacy settlement snapshots (${formatMoneyPhp(summary.legacyOpenSettlementPhp)}) were already collected by stores and are not payable (originals kept). ${summary.legacyManualPaidCount} legacy manual payouts (${formatMoneyPhp(summary.legacyManualPaidPhp)}) need review.`
        )}
        {summary.coinOverCredit > 0
          ? pickCommissionCopy(
              lang,
              ` 지급 기준을 초과해 적립된 코인 ${summary.coinOverCredit}.`,
              ` Coin credited above the payout rule: ${summary.coinOverCredit}.`
            )
          : ""}
        {summary.legacyPreservedOrders > 0
          ? pickCommissionCopy(
              lang,
              ` 변경 전 적립 ${summary.legacyPreservedOrders}건은 기록 그대로 보존합니다.`,
              ` ${summary.legacyPreservedOrders} orders credited under the previous rule are preserved as recorded.`
            )
          : ""}
      </p>
    </div>
  );
}

export function PlatformPayableTable({ page, lang, showStore }: { page: StorePlatformPayablePage; lang: CommissionLang; showStore: boolean }) {
  if (page.rows.length === 0) {
    return <p className="sam-text-body text-sam-muted">{pickCommissionCopy(lang, "해당 주문이 없습니다.", "No orders.")}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="sam-text-xxs text-sam-muted">
          <tr>
            <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "주문", "Order")}</th>
            {showStore ? <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "매장", "Store")}</th> : null}
            <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "분류", "Class")}</th>
            <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "직접 수령", "Direct")}</th>
            <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "플랫폼 보유", "Held")}</th>
            <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "상품권 순액(레일)", "Gift net (rail)")}</th>
            <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "쿠폰 Coin", "Coupon Coin")}</th>
            <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "Coin 미적립", "Coin pending")}</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((r) => (
            <tr key={r.orderId} className="border-t border-sam-border-soft tabular-nums">
              <td className="py-1.5 pr-3">
                <div className="font-medium">{r.orderNo}</div>
                <div className="sam-text-xxs text-sam-muted">{formatTs(r.createdAt)}</div>
              </td>
              {showStore ? <td className="py-1.5 pr-3">{r.storeName}</td> : null}
              <td className="py-1.5 pr-3 sam-text-xxs">{STORE_PAYOUT_CLASS_LABEL[r.payoutClass]?.[lang] ?? r.payoutClass}</td>
              <td className="py-1.5 pr-3 text-right">{formatMoneyPhp(r.directPhp)}</td>
              <td className="py-1.5 pr-3 text-right">{formatMoneyPhp(r.heldPhp)}</td>
              <td className="py-1.5 pr-3 text-right">{formatMoneyPhp(r.giftRailNetPhp)}</td>
              <td className="py-1.5 pr-3 text-right">{formatMoneyPhp(r.heldPaidByCoinPhp)}</td>
              <td className={`py-1.5 pr-3 text-right font-semibold ${r.payablePhp > 0 ? "text-amber-800" : ""}`}>{formatMoneyPhp(r.payablePhp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
