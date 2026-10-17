"use client";

/**
 * Admin — 배달 정산 = 매장 수수료 · 캐시 원장 (`/admin/store-settlements`).
 *
 * 매장 직접 결제 모델: 정상 주문에는 수동 "정산/지급" CTA 가 없다.
 * - 조리 시작 시 수수료 자동 부과·캐시 차감 (DB 트리거, 부족분은 미납 → 순잔액 마이너스)
 * - 관리자 개입: 취소·환불 수수료 결정(승인 전액/부분 · 거절) + 캐시 부족 주문 차단 정책 + 금융 예외 확인
 * - 원장 직접 수정 기능 없음 — 정정은 결정 기록으로만
 * Owner 화면과 같은 SQL 함수·컴포넌트(StoreCommissionLedgerParts / StoreCommissionLedgerTable)를 쓴다.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import {
  phpToCashMinor,
  splitStoreCommissionApproval,
  STORE_CASH_ORDER_GATE_LABEL,
  STORE_CASH_ORDER_GATE_MODES,
  STORE_COMMISSION_FILTER_STATES,
  type BusinessCashLedgerKind,
  type StoreCashOrderGateMode,
  type StoreCashPosition,
  type StoreCommissionLedgerFilterState,
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
  buildStoreCommissionLedgerSearch,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  CashLedgerKindChips,
  CashLedgerView,
  COMMISSION_TAB_LABEL,
  CommissionBreakdownTable,
  CommissionFilterChips,
  CommissionPeriodFilter,
  CommissionReviewFilterChips,
  CommissionRowMoney,
  CommissionSummaryGrid,
  chipClass,
  formatCashMinor,
  LedgerPager,
  pickCommissionCopy,
  PlatformPayableSummaryGrid,
  PlatformPayableTable,
  resolveCommissionTab,
  ROW_ACTION_BTN,
  StoreCashPositionCard,
  tabLedgerState,
  type CommissionBreakdownGroup,
  type CommissionLang,
  type CommissionReviewFilter,
  type CommissionTab,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  CommissionLedgerTable,
  CommissionOrderDetailPanel,
  HorizontalScrollRegion,
} from "@/components/stores/commission/StoreCommissionLedgerTable";

const PAGE_SIZE = 100;
const TABS: readonly CommissionTab[] = ["ledger", "review", "cash", "exceptions", "payable"];
const BREAKDOWN_GROUPS: readonly CommissionBreakdownGroup[] = ["day", "month", "store"];
/** Old per-order settlement queue links (`?unpaid_only=1`, `?settlement_status=…`, `?id=…`). */
const LEGACY_QUEUE_PARAMS = ["unpaid_only", "settlement_status", "id"] as const;

type GateSetting = { mode: StoreCashOrderGateMode; reason: string | null; changedBy: string | null; changedAt: string | null };

type LedgerResponse = {
  ok: boolean;
  error?: string;
  gate?: GateSetting;
  rows?: StoreCommissionLedgerRow[];
  totalRows?: number;
  summary?: StoreCommissionLedgerSummary;
  positions?: StoreCashPosition[];
  storeNames?: Record<string, string>;
  breakdown?: { group: CommissionBreakdownGroup; rows: StoreCommissionBreakdownRow[] };
  payableSummary?: StorePlatformPayableSummary;
};

type CashResponse = StoreCashLedgerPage & { ok: boolean; error?: string };
type PayableResponse = StorePlatformPayablePage & { ok: boolean; error?: string };

type IntegrityResponse = {
  ok: boolean;
  obligations?: number;
  checks?: Record<string, { violations: number; ids: string[] }>;
  originalUnknown?: { count: number; ids: string[] };
};

/** All-time headline for the four work cards — independent of tab / period filters. */
type Headline = {
  summary: StoreCommissionLedgerSummary | null;
  positions: StoreCashPosition[];
  integrity: IntegrityResponse | null;
  exceptionOrders: number | null;
};

type DecisionModal = {
  row: StoreCommissionLedgerRow;
  decision: "approve" | "reject" | null;
  /** PHP string for partial approval; empty = full amount. */
  amountPhp: string;
  reason: string;
  step: "form" | "confirm";
  /** One key per opened decision — a double click / retry replays, never re-executes. */
  idempotencyKey: string;
};

type GateModal = { mode: StoreCashOrderGateMode; reason: string; step: "form" | "confirm" };

const ADJUST_ERROR: Record<string, { ko: string; en: string }> = {
  reason_required: { ko: "처리 사유를 2자 이상 입력하세요.", en: "Enter a reason (2+ characters)." },
  invalid_amount: { ko: "승인액은 0보다 크고 남은 수수료 이하여야 합니다.", en: "Amount must be > 0 and ≤ remaining fee." },
  not_in_review: { ko: "이미 처리된 건입니다. 새로고침하세요.", en: "Already decided. Refresh." },
  order_not_closed: { ko: "주문이 취소/환불 상태가 아닙니다.", en: "Order is not cancelled/refunded." },
  admin_required: { ko: "관리자 권한이 필요합니다.", en: "Admin permission required." },
  rpc_missing: { ko: "DB 마이그레이션이 적용되지 않았습니다.", en: "DB migration not applied." },
};

const CHECK_LABEL: Record<string, { ko: string; en: string }> = {
  charged_eq_due_plus_adjustments: { ko: "원부과액 = 잔여 부과 + 승인 환급", en: "Charged = remaining + approved" },
  cash_ledger_eq_fee_paid: { ko: "캐시 원장 차감액 = 수수료 납부액", en: "Cash ledger = fee paid" },
  status_matches_amounts: { ko: "상태 = 금액 일치", en: "Status matches amounts" },
  closed_orders_reviewed: { ko: "취소·환불 주문 수수료 검토 누락 없음", en: "Closed orders reviewed" },
  balance_eq_ledger_sum: { ko: "캐시 잔액 = 원장 합계", en: "Balance = ledger sum" },
};

/** Admin console primary CTA — locked contrast (sam-primary is intentionally washed out under data-admin). */
const ADMIN_PRIMARY_BTN =
  "inline-flex min-h-9 touch-manipulation select-none items-center justify-center whitespace-nowrap rounded-ui-rect bg-[var(--admin-action-primary-bg)] px-3 py-2 sam-text-helper font-semibold text-[var(--admin-action-primary-fg)] transition-[background-color,transform] duration-150 hover:bg-[var(--admin-action-primary-hover)] active:scale-[0.98] active:bg-[var(--admin-action-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:scale-100 disabled:bg-[var(--admin-action-primary-disabled-bg)] disabled:text-[var(--admin-action-primary-disabled-fg)]";

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function WorkCard({
  title,
  value,
  sub,
  tone,
  active,
  onClick,
}: {
  title: string;
  value: string;
  sub: string;
  tone: "default" | "warn" | "danger" | "good";
  active: boolean;
  onClick: () => void;
}) {
  const valueTone = tone === "danger" ? "text-sam-danger" : tone === "warn" ? "text-sam-warning" : tone === "good" ? "text-sam-success" : "text-sam-fg";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 touch-manipulation select-none rounded-ui-rect border p-3 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] ${
        active ? "border-signature bg-signature/5" : "border-sam-border bg-sam-surface hover:bg-sam-surface-muted"
      }`}
    >
      <p className="sam-text-xxs font-semibold text-sam-muted">{title}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${valueTone}`}>{value}</p>
      <p className="break-words sam-text-xxs text-sam-muted">{sub}</p>
    </button>
  );
}

export function AdminStoreCommissionLedgerPage() {
  const { language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const storeId = searchParams.get("store_id")?.trim() ?? "";
  const legacyQueueLink = LEGACY_QUEUE_PARAMS.some((k) => searchParams.has(k));
  const stateParam = (searchParams.get("state")?.trim() ?? "all") as StoreCommissionLedgerFilterState;
  const urlState = STORE_COMMISSION_FILTER_STATES.includes(stateParam) ? stateParam : "all";
  const resolved = resolveCommissionTab(searchParams.get("tab"), TABS);
  const tab: CommissionTab =
    resolved.tab ?? (legacyQueueLink ? "payable" : urlState === "review_required" ? "review" : "ledger");

  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: "all",
    fromDay: "",
    toDay: "",
  });
  const [ledgerState, setLedgerState] = useState<StoreCommissionLedgerFilterState>(
    urlState === "review_required" ? "all" : urlState
  );
  const [reviewFilter, setReviewFilter] = useState<CommissionReviewFilter>(resolved.review ?? "review_required");
  // Admin alert deep link: ?order_no=…&open=<obligation id> → filter to the order and open its detail.
  const [orderNo, setOrderNo] = useState(() => searchParams.get("order_no")?.trim() ?? "");
  const openParam = searchParams.get("open")?.trim() ?? "";
  const openedFromLinkRef = useRef<string | null>(null);
  const [kinds, setKinds] = useState<BusinessCashLedgerKind[]>([]);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [cash, setCash] = useState<CashResponse | null>(null);
  const [payable, setPayable] = useState<PayableResponse | null>(null);
  const [payableAll, setPayableAll] = useState(false);
  const [exceptionsPage, setExceptionsPage] = useState<PayableResponse | null>(null);
  const [group, setGroup] = useState<CommissionBreakdownGroup>("day");
  const [headline, setHeadline] = useState<Headline>({ summary: null, positions: [], integrity: null, exceptionOrders: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StoreCommissionLedgerRow | null>(null);
  const [modal, setModal] = useState<DecisionModal | null>(null);
  const [gateModal, setGateModal] = useState<GateModal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setUrl = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const k of LEGACY_QUEUE_PARAMS) sp.delete(k);
      sp.delete("open");
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "all") sp.set(k, v);
        else sp.delete(k);
      }
      setOffset(0);
      setSelected(null);
      router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`);
    },
    [pathname, router, searchParams]
  );

  const effectiveState = tabLedgerState(tab, ledgerState, reviewFilter);

  const loadHeadline = useCallback(async () => {
    const scope = storeId ? `store_id=${encodeURIComponent(storeId)}&` : "";
    try {
      const [ledgerRes, integrityRes, exRes] = await Promise.all([
        fetch(`/api/admin/store-commission-ledger?${scope}limit=1`, { credentials: "include" }),
        fetch(`/api/admin/store-commission-ledger/integrity${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ""}`, {
          credentials: "include",
        }),
        fetch(`/api/admin/store-commission-ledger/payable?${scope}view=exceptions&limit=1`, { credentials: "include" }),
      ]);
      const lj = (await ledgerRes.json()) as LedgerResponse;
      const ij = (await integrityRes.json()) as IntegrityResponse;
      const ej = (await exRes.json()) as PayableResponse;
      setHeadline({
        summary: lj.ok ? lj.summary ?? null : null,
        positions: lj.ok ? lj.positions ?? [] : [],
        integrity: ij.ok ? ij : null,
        exceptionOrders: ej.ok ? ej.totalRows : null,
      });
    } catch {
      setHeadline((h) => ({ ...h }));
    }
  }, [storeId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const common = { storeId, period: period.period, fromDay: period.fromDay, toDay: period.toDay };
      const listTab = tab === "ledger" || tab === "review";
      const ledgerQs = buildStoreCommissionLedgerSearch({
        ...common,
        state: effectiveState,
        orderNo: orderNo || null,
        group,
        limit: listTab ? PAGE_SIZE : 1,
        offset: listTab ? offset : 0,
      });
      const ledgerReq = fetch(`/api/admin/store-commission-ledger?${ledgerQs}`, { credentials: "include" });
      const pagedQs = buildStoreCommissionLedgerSearch({ ...common, limit: PAGE_SIZE, offset });
      const cashReq =
        tab === "cash"
          ? fetch(
              `/api/admin/store-commission-ledger/cash-ledger?${buildStoreCommissionLedgerSearch({ ...common, kinds, limit: PAGE_SIZE, offset })}`,
              { credentials: "include" }
            )
          : null;
      const payableReq =
        tab === "payable"
          ? fetch(`/api/admin/store-commission-ledger/payable?${pagedQs}&view=${payableAll ? "all" : "payable"}`, { credentials: "include" })
          : null;
      const exceptionsReq =
        tab === "exceptions"
          ? fetch(`/api/admin/store-commission-ledger/payable?${pagedQs}&view=exceptions`, { credentials: "include" })
          : null;
      const res = await ledgerReq;
      const json = (await res.json()) as LedgerResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
      if (cashReq) {
        const c = await cashReq;
        const cj = (await c.json()) as CashResponse;
        if (!c.ok || !cj.ok) setError(cj.error ?? `HTTP ${c.status}`);
        else setCash(cj);
      }
      if (payableReq) {
        const pr = await payableReq;
        const pj = (await pr.json()) as PayableResponse;
        if (!pr.ok || !pj.ok) setError(pj.error ?? `HTTP ${pr.status}`);
        else setPayable(pj);
      }
      if (exceptionsReq) {
        const er = await exceptionsReq;
        const ej = (await er.json()) as PayableResponse;
        if (!er.ok || !ej.ok) setError(ej.error ?? `HTTP ${er.status}`);
        else setExceptionsPage(ej);
      }
    } catch {
      setError("network_error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveState, group, kinds, offset, orderNo, payableAll, period, storeId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadHeadline();
  }, [loadHeadline]);

  useEffect(() => {
    if (!openParam || openedFromLinkRef.current === openParam) return;
    const hit = data?.rows?.find((r) => r.obligationId === openParam);
    if (hit) {
      openedFromLinkRef.current = openParam;
      setSelected(hit);
    }
  }, [data?.rows, openParam]);

  const positions = useMemo(() => data?.positions ?? [], [data?.positions]);
  const sortedPositions = useMemo(() => [...positions].sort((a, b) => a.netMinor - b.netMinor), [positions]);
  const storeNames = useMemo(() => new Map(Object.entries(data?.storeNames ?? {})), [data?.storeNames]);
  const selectedPosition = storeId ? positions.find((p) => p.storeId === storeId) ?? null : null;
  const blockedCount = positions.filter((p) => !p.orderable).length;
  const negativeCount = positions.filter((p) => p.netMinor < 0).length;
  const wouldBlockCount = positions.filter((p) => p.netMinor <= 0).length;

  const anomalyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of Object.values(headline.integrity?.checks ?? {})) for (const id of c.ids ?? []) ids.add(String(id));
    return ids;
  }, [headline.integrity]);
  const integrityViolations = Object.entries(headline.integrity?.checks ?? {}).reduce((n, [, c]) => n + (c.violations ?? 0), 0);
  const headOutstanding = headline.positions.reduce((n, p) => n + p.outstandingMinor, 0);
  const headNegative = headline.positions.filter((p) => p.netMinor < 0).length;

  const runOnce = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitGate = () =>
    runOnce(async () => {
      if (!gateModal) return;
      setModalError(null);
      const res = await fetch("/api/admin/store-commission-ledger/gate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: gateModal.mode, reason: gateModal.reason.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setModalError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      setGateModal(null);
      await Promise.all([load(), loadHeadline()]);
    });

  const approvedMinorInput = (m: DecisionModal): number | null => {
    const t = m.amountPhp.trim();
    if (!t) return null;
    const v = Number(t);
    return Number.isFinite(v) ? phpToCashMinor(v) : NaN;
  };

  const submitDecision = () =>
    runOnce(async () => {
      if (!modal?.decision) return;
      setModalError(null);
      const amt = modal.decision === "approve" ? approvedMinorInput(modal) : null;
      const res = await fetch("/api/admin/store-commission-ledger/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          order_id: modal.row.orderId,
          decision: modal.decision,
          approved_minor: amt,
          reason: modal.reason.trim(),
          idempotency_key: modal.idempotencyKey,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        idempotent?: boolean;
        cashRefundMinor?: number;
        outstandingCancelMinor?: number;
      };
      if (!res.ok || !json.ok) {
        const code = json.error ?? `HTTP ${res.status}`;
        setModalError(
          ADJUST_ERROR[code]?.[lang] ??
            pickCommissionCopy(lang, `처리하지 못했습니다. 내용은 그대로 두었으니 다시 시도해 주세요. (${code})`, `Not saved. Your input is kept — please try again. (${code})`)
        );
        setModal({ ...modal, step: "form" });
        return;
      }
      const decidedNo = modal.row.orderNo;
      setModal(null);
      setSelected(null);
      setNotice(
        modal.decision === "approve"
          ? pickCommissionCopy(
              lang,
              `#${decidedNo} 환급 승인 완료 — 캐시 환급 ${formatCashMinor(json.cashRefundMinor ?? 0)} · 미납 취소 ${formatCashMinor(json.outstandingCancelMinor ?? 0)}`,
              `#${decidedNo} refund approved — Cash ${formatCashMinor(json.cashRefundMinor ?? 0)} · unpaid cancelled ${formatCashMinor(json.outstandingCancelMinor ?? 0)}`
            )
          : pickCommissionCopy(lang, `#${decidedNo} 환급 거절 완료 — 금액 이동 없음`, `#${decidedNo} refund rejected — no money moved`)
      );
      emitAdminQueueChanged("settlements");
      await Promise.all([load(), loadHeadline()]);
    });

  const openDecision = (row: StoreCommissionLedgerRow) => {
    setModalError(null);
    setModal({ row, decision: null, amountPhp: "", reason: "", step: "form", idempotencyKey: newKey() });
  };

  const rows = data?.rows ?? [];
  const totalRows = data?.totalRows ?? 0;
  const gateMode = data?.gate?.mode ?? "off";

  const decisionPreview = modal
    ? modal.decision === "approve"
      ? (() => {
          const amt = approvedMinorInput(modal);
          const total = modal.row.feePaidMinor + modal.row.feeOutstandingMinor;
          return splitStoreCommissionApproval({
            approvedMinor: amt == null ? total : amt,
            feePaidMinor: modal.row.feePaidMinor,
            feeOutstandingMinor: modal.row.feeOutstandingMinor,
          });
        })()
      : null
    : null;
  const decisionValid =
    !!modal?.decision &&
    modal.reason.trim().length >= 2 &&
    (modal.decision === "reject" || decisionPreview !== null);

  const decideButton = (r: StoreCommissionLedgerRow) =>
    r.state === "review_required" ? (
      <button type="button" className={ADMIN_PRIMARY_BTN} disabled={busy} onClick={() => openDecision(r)}>
        {pickCommissionCopy(lang, "수수료 결정", "Decide")}
      </button>
    ) : null;

  return (
    <div className="min-w-0 space-y-4" data-commission-admin="1">
      <AdminPageHeader
        title={pickCommissionCopy(lang, "배달 정산 · 매장 수수료 원장", "Delivery settlement · Store commission ledger")}
        description={pickCommissionCopy(
          lang,
          "고객은 매장에 직접 결제합니다(COD·GCash·계좌이체). 정상 주문의 수수료는 조리 시작 시 매장 캐시에서 자동 부과·차감되며, 주문별 정산·지급 버튼은 없습니다. 관리자는 취소·환불 수수료 결정, 캐시 부족 주문 차단 정책, 금융 예외 확인만 처리합니다.",
          "Buyers pay the store directly. Normal orders are auto-charged from the store's Cash at cooking start — there is no per-order settle/pay button. Admins only decide cancel/refund commission, the Cash-shortage order block, and review financial exceptions."
        )}
      />

      {legacyQueueLink ? (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg" role="status" data-legacy-queue-notice="1">
          {pickCommissionCopy(
            lang,
            "주문별 '정산 검토'·'지급 예정' 큐는 폐지되었습니다. 직접 결제 주문의 과거 '정산 예정' 금액은 매장이 이미 받은 돈이라 지급 대상이 아닙니다. 실제 플랫폼 지급 의무는 아래 [플랫폼 지급 의무]에서 확인하세요.",
            "The per-order 'settlement review / scheduled payout' queue is retired. Legacy 'scheduled' amounts on direct-pay orders were already collected by stores. See [Platform payable] for what the platform actually owes."
          )}
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-start justify-between gap-2 rounded-ui-rect border border-sam-success bg-sam-success-soft px-3 py-2 sam-text-helper text-sam-fg" role="status" data-decision-result="1">
          <span>{notice}</span>
          <button type="button" className="sam-text-xxs underline" onClick={() => setNotice(null)}>
            {pickCommissionCopy(lang, "닫기", "Dismiss")}
          </button>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="work cards">
        <WorkCard
          title={pickCommissionCopy(lang, "자동 수수료", "Auto commission")}
          value={headline.summary ? formatCashMinor(headline.summary.netCommissionMinor) : "—"}
          sub={pickCommissionCopy(
            lang,
            `정상 주문 ${headline.summary?.count ?? 0}건 자동 부과·차감 (전체 기간)`,
            `${headline.summary?.count ?? 0} orders auto-charged (all time)`
          )}
          tone="default"
          active={tab === "ledger"}
          onClick={() => setUrl({ tab: "ledger" })}
        />
        <WorkCard
          title={pickCommissionCopy(lang, "미납 관리", "Unpaid")}
          value={formatCashMinor(headOutstanding)}
          sub={pickCommissionCopy(
            lang,
            `순잔액 마이너스 ${headNegative}곳 · 차단 ${STORE_CASH_ORDER_GATE_LABEL[gateMode][lang]}`,
            `${headNegative} negative · block ${STORE_CASH_ORDER_GATE_LABEL[gateMode][lang]}`
          )}
          tone={headOutstanding > 0 ? "danger" : "good"}
          active={tab === "cash"}
          onClick={() => setUrl({ tab: "cash" })}
        />
        <WorkCard
          title={pickCommissionCopy(lang, "환불 검토", "Refund review")}
          value={pickCommissionCopy(lang, `${headline.summary?.reviewCount ?? 0}건`, `${headline.summary?.reviewCount ?? 0}`)}
          sub={pickCommissionCopy(
            lang,
            `관리자 결정 필요 · ${formatCashMinor(headline.summary?.reviewFeeMinor ?? 0)}`,
            `Needs a decision · ${formatCashMinor(headline.summary?.reviewFeeMinor ?? 0)}`
          )}
          tone={(headline.summary?.reviewCount ?? 0) > 0 ? "warn" : "good"}
          active={tab === "review"}
          onClick={() => setUrl({ tab: "review" })}
        />
        <WorkCard
          title={pickCommissionCopy(lang, "원장 대조", "Ledger check")}
          value={
            headline.integrity
              ? pickCommissionCopy(lang, `이상 ${integrityViolations + (headline.exceptionOrders ?? 0)}건`, `${integrityViolations + (headline.exceptionOrders ?? 0)} issues`)
              : "—"
          }
          sub={pickCommissionCopy(
            lang,
            `무결성 위반 ${integrityViolations} · 코인·지급 예외 ${headline.exceptionOrders ?? "—"}`,
            `${integrityViolations} integrity · ${headline.exceptionOrders ?? "—"} Coin/payout exceptions`
          )}
          tone={integrityViolations + (headline.exceptionOrders ?? 0) > 0 ? "danger" : "good"}
          active={tab === "exceptions"}
          onClick={() => setUrl({ tab: "exceptions" })}
        />
      </section>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={chipClass(tab === t)} aria-current={tab === t ? "page" : undefined} onClick={() => setUrl({ tab: t, state: "" })}>
            {COMMISSION_TAB_LABEL[t][lang]}
            {t === "review" && (headline.summary?.reviewCount ?? 0) > 0 ? ` ${headline.summary?.reviewCount}` : ""}
          </button>
        ))}
        {storeId ? (
          <span className="ml-1 inline-flex items-center gap-2 rounded-full bg-sam-surface-muted px-3 py-1 sam-text-xxs text-sam-fg">
            {storeNames.get(storeId) || storeId.slice(0, 8)}
            <button type="button" className="font-medium text-signature underline" onClick={() => setUrl({ store_id: "" })}>
              {pickCommissionCopy(lang, "전체 매장", "All stores")}
            </button>
          </span>
        ) : null}
      </nav>

      <CommissionPeriodFilter
        period={period.period}
        fromDay={period.fromDay}
        toDay={period.toDay}
        lang={lang}
        onChange={(p) => {
          setOffset(0);
          setPeriod(p);
        }}
      />

      {error ? <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">{error}</p> : null}

      {tab === "ledger" || tab === "review" ? (
        <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
          {selectedPosition ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-sam-fg">{storeNames.get(selectedPosition.storeId) || storeId}</p>
              <StoreCashPositionCard position={selectedPosition} lang={lang} />
            </div>
          ) : null}
          {tab === "review" ? (
            <p className="sam-text-helper text-sam-muted">
              {pickCommissionCopy(
                lang,
                "조리 시작 후 취소·환불된 주문만 표시합니다. 승인 시 미납이 먼저 취소되고 남은 금액만 실제 차감액 한도로 캐시에 환급됩니다.",
                "Only orders cancelled/refunded after cooking. Approval cancels unpaid first; only the remainder returns to Cash, capped at what was paid."
              )}
            </p>
          ) : null}
          {data?.summary ? <CommissionSummaryGrid summary={data.summary} lang={lang} /> : null}
          {tab === "ledger" && data?.breakdown ? (
            <CommissionBreakdownTable
              rows={data.breakdown.rows}
              group={group}
              groups={storeId ? BREAKDOWN_GROUPS.filter((g) => g !== "store") : BREAKDOWN_GROUPS}
              onGroupChange={setGroup}
              lang={lang}
            />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {tab === "ledger" ? (
              <CommissionFilterChips
                value={ledgerState}
                lang={lang}
                onChange={(s) => {
                  setOffset(0);
                  setLedgerState(s);
                }}
              />
            ) : (
              <CommissionReviewFilterChips
                value={reviewFilter}
                lang={lang}
                reviewCount={headline.summary?.reviewCount}
                onChange={(f) => {
                  setOffset(0);
                  setReviewFilter(f);
                }}
              />
            )}
            <input
              className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
              value={orderNo}
              onChange={(e) => {
                setOffset(0);
                setOrderNo(e.target.value);
              }}
              placeholder={pickCommissionCopy(lang, "주문번호 검색", "Search order no.")}
              aria-label="order no"
            />
            <button type="button" className={ROW_ACTION_BTN} onClick={() => void load()} disabled={loading} data-ledger-refresh="1">
              {loading ? pickCommissionCopy(lang, "불러오는 중…", "Loading…") : pickCommissionCopy(lang, "새로고침", "Refresh")}
            </button>
          </div>
          <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
          {loading && rows.length === 0 ? (
            <p className="py-6 text-center sam-text-body text-sam-muted" data-state="loading">{pickCommissionCopy(lang, "불러오는 중…", "Loading…")}</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center sam-text-body text-sam-muted" data-state="empty">
              {tab === "review"
                ? pickCommissionCopy(lang, "해당 조건의 취소·환불 건이 없습니다.", "No cancelled/refunded orders for this filter.")
                : pickCommissionCopy(lang, "해당하는 수수료 내역이 없습니다.", "No commission rows.")}
            </p>
          ) : (
            <CommissionLedgerTable
              rows={rows}
              lang={lang}
              showStore={!storeId}
              onOpen={setSelected}
              selectedObligationId={selected?.obligationId ?? null}
              renderAction={decideButton}
              anomalyObligationIds={anomalyIds}
            />
          )}
          <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
        </section>
      ) : null}

      {tab === "cash" ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4" aria-label="policy">
            <div className="flex flex-wrap items-center gap-2">
              <span className="sam-text-helper font-medium text-sam-fg">
                {pickCommissionCopy(lang, "캐시 부족 매장 신규 주문 차단", "Block new orders when Cash is short")}
              </span>
              {STORE_CASH_ORDER_GATE_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={busy || loading || gateMode === mode}
                  onClick={() => {
                    setModalError(null);
                    setGateModal({ mode, reason: "", step: "form" });
                  }}
                  className={chipClass(gateMode === mode)}
                  aria-pressed={gateMode === mode}
                >
                  {STORE_CASH_ORDER_GATE_LABEL[mode][lang]}
                </button>
              ))}
            </div>
            {data?.gate?.changedAt ? (
              <p className="mt-1 sam-text-xxs text-sam-muted">
                {pickCommissionCopy(lang, "최근 변경", "Last change")}: {data.gate.changedAt.slice(0, 16).replace("T", " ")} UTC · {data.gate.reason}
              </p>
            ) : null}
          </section>

          <section className="min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "매장별 캐시 · 미납 · 주문 제한", "Cash, unpaid & order block by store")}</h2>
              <p className="sam-text-xxs text-sam-muted">
                {pickCommissionCopy(lang, `마이너스 ${negativeCount}곳 · 주문 차단 ${blockedCount}곳`, `${negativeCount} negative · ${blockedCount} blocked`)}
              </p>
            </div>
            {selectedPosition ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-sam-fg">{storeNames.get(selectedPosition.storeId) || storeId}</p>
                <StoreCashPositionCard position={selectedPosition} lang={lang} />
                <Link href={businessCcFinancialStatementHref(storeId)} className="inline-block sam-text-helper font-medium text-signature underline">
                  {pickCommissionCopy(lang, "매장 재무제표 보기", "Store financial statement")}
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                <HorizontalScrollRegion label={pickCommissionCopy(lang, "매장별 캐시 표", "Cash by store")} lang={lang}>
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
                    <thead className="sam-text-xxs text-sam-muted">
                      <tr>
                        <th className="sticky left-0 z-10 border-b border-sam-border-soft bg-sam-app px-3 py-2">{pickCommissionCopy(lang, "매장", "Store")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{pickCommissionCopy(lang, "캐시 잔액", "Cash")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{pickCommissionCopy(lang, "미납", "Unpaid")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{pickCommissionCopy(lang, "순잔액", "Net")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2">{pickCommissionCopy(lang, "신규 주문", "New orders")}</th>
                        <th className="sticky right-0 z-10 border-b border-sam-border-soft bg-sam-app px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPositions.map((p) => {
                        const bg = p.netMinor < 0 ? "bg-sam-danger-soft" : "bg-sam-surface";
                        return (
                          <tr key={p.storeId} data-store-net={p.netMinor < 0 ? "negative" : "ok"}>
                            <td className={`sticky left-0 z-10 border-b border-sam-border-soft px-3 py-2 ${bg}`}>
                              <span className="block max-w-[16rem] break-words">{storeNames.get(p.storeId) || p.storeId.slice(0, 8)}</span>
                            </td>
                            <td className={`border-b border-sam-border-soft px-3 py-2 text-right tabular-nums ${bg}`}>{formatCashMinor(p.balanceMinor)}</td>
                            <td className={`border-b border-sam-border-soft px-3 py-2 text-right tabular-nums ${bg} ${p.outstandingMinor > 0 ? "text-sam-danger" : ""}`}>
                              {formatCashMinor(p.outstandingMinor)}
                            </td>
                            <td className={`border-b border-sam-border-soft px-3 py-2 text-right font-semibold tabular-nums ${bg} ${p.netMinor < 0 ? "text-sam-danger" : "text-sam-fg"}`}>
                              {formatCashMinor(p.netMinor)}
                            </td>
                            <td className={`border-b border-sam-border-soft px-3 py-2 ${bg}`}>
                              <span className={`sam-text-xxs font-semibold ${p.orderable ? "text-sam-success" : "text-sam-danger"}`}>
                                {p.orderable ? pickCommissionCopy(lang, "접수 가능", "Open") : pickCommissionCopy(lang, "차단", "Blocked")}
                              </span>
                            </td>
                            <td className={`sticky right-0 z-10 border-b border-sam-border-soft px-3 py-2 text-right ${bg}`}>
                              <button
                                type="button"
                                className={ROW_ACTION_BTN}
                                onClick={() => setUrl({ store_id: p.storeId, tab: "ledger" })}
                              >
                                {pickCommissionCopy(lang, "원장 보기", "Ledger")}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </HorizontalScrollRegion>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "캐시 거래 (충전·차감·환급)", "Cash transactions")}</h2>
            <CashLedgerKindChips
              value={kinds}
              lang={lang}
              onChange={(k) => {
                setOffset(0);
                setKinds(k);
              }}
            />
            {cash ? <CashLedgerView page={cash} lang={lang} showStore={!storeId} /> : null}
            {cash ? <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={cash.totalRows} loading={loading} onChange={setOffset} lang={lang} /> : null}
          </section>
        </>
      ) : null}

      {tab === "exceptions" ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4" aria-label="integrity">
            <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "원장 무결성 검사 (DB)", "Ledger integrity (DB)")}</h2>
            <p className="mt-1 sam-text-xxs text-sam-muted">
              {pickCommissionCopy(
                lang,
                "확인 전용입니다. 근거 없는 금액 정정 기능은 제공하지 않으며, 정정은 OWNER 승인 후 기록 거래로만 수행합니다.",
                "Read only. No ad-hoc correction; fixes are recorded transactions after OWNER approval."
              )}
            </p>
            {headline.integrity?.checks ? (
              <ul className="mt-2 space-y-1 sam-text-helper">
                {Object.entries(headline.integrity.checks).map(([k, c]) => (
                  <li key={k} className={c.violations === 0 ? "text-sam-success" : "font-semibold text-sam-danger"} data-integrity-check={k}>
                    {c.violations === 0 ? "PASS" : `FAIL ${c.violations}`} · {CHECK_LABEL[k]?.[lang] ?? k}
                    {c.violations > 0 ? (
                      <span className="ml-1 break-all sam-text-xxs font-normal">
                        ({c.ids.slice(0, 5).map((id) => storeNames.get(id) ?? id.slice(0, 8)).join(", ")})
                      </span>
                    ) : null}
                  </li>
                ))}
                {headline.integrity.originalUnknown && headline.integrity.originalUnknown.count > 0 ? (
                  <li className="text-sam-warning">
                    NOT_PROVEN {headline.integrity.originalUnknown.count} ·{" "}
                    {pickCommissionCopy(lang, "원부과액 증거 없는 레거시 행", "Legacy rows without original fee evidence")}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 sam-text-helper text-sam-muted">{pickCommissionCopy(lang, "검사 결과 없음", "No result")}</p>
            )}
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {pickCommissionCopy(
                lang,
                "수수료 부과 실패는 주문 상태 변경 자체가 롤백되므로(주문은 이전 상태 유지) 원장에 미처리 건이 남지 않습니다.",
                "A failed commission charge rolls back the status change itself, so no half-processed rows remain."
              )}
            </p>
          </section>

          <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {pickCommissionCopy(lang, "코인 과다 지급 · 과거 수동 지급 의심", "Coin over-credit · legacy manual payouts")}
            </h2>
            <p className="sam-text-xxs text-sam-muted">
              {pickCommissionCopy(
                lang,
                "플랫폼 보유분(선물·쿠폰) 중 상품권 레일을 제외한 금액보다 코인이 많이 지급된 주문, 과거 수동 지급 주문입니다. 확인 전용.",
                "Orders whose Coin exceeds platform-held money not on the gift rail, and legacy manual payouts. Read only."
              )}
            </p>
            {exceptionsPage ? (
              exceptionsPage.rows.length === 0 ? (
                <p className="py-4 text-center sam-text-body text-sam-muted" data-state="empty">{pickCommissionCopy(lang, "예외 없음", "No exceptions")}</p>
              ) : (
                <PlatformPayableTable page={exceptionsPage} lang={lang} showStore={!storeId} />
              )
            ) : (
              <p className="py-4 text-center sam-text-body text-sam-muted">{pickCommissionCopy(lang, "불러오는 중…", "Loading…")}</p>
            )}
            {exceptionsPage ? (
              <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={exceptionsPage.totalRows} loading={loading} onChange={setOffset} lang={lang} />
            ) : null}
          </section>
        </>
      ) : null}

      {tab === "payable" ? (
        <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
          {data?.payableSummary ? <PlatformPayableSummaryGrid summary={data.payableSummary} lang={lang} /> : null}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={chipClass(!payableAll)}
              onClick={() => {
                setOffset(0);
                setPayableAll(false);
              }}
            >
              {pickCommissionCopy(lang, "지급 의무만", "Payable only")}
            </button>
            <button
              type="button"
              className={chipClass(payableAll)}
              onClick={() => {
                setOffset(0);
                setPayableAll(true);
              }}
            >
              {pickCommissionCopy(lang, "완료 주문 전체", "All completed orders")}
            </button>
          </div>
          {payable ? <PlatformPayableTable page={payable} lang={lang} showStore={!storeId} /> : null}
          {payable ? <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={payable.totalRows} loading={loading} onChange={setOffset} lang={lang} /> : null}
        </section>
      ) : null}

      {selected ? (
        <CommissionOrderDetailPanel
          row={selected}
          lang={lang}
          anomaly={anomalyIds.has(selected.obligationId)}
          orderHref={`/admin/stores/orders/${encodeURIComponent(selected.orderId)}`}
          onClose={() => setSelected(null)}
          footer={
            selected.state === "review_required" ? (
              <button type="button" className={`${ADMIN_PRIMARY_BTN} w-full`} disabled={busy} onClick={() => openDecision(selected)}>
                {pickCommissionCopy(lang, "수수료 결정 (승인 · 거절)", "Decide (approve · reject)")}
              </button>
            ) : (
              <p className="sam-text-xxs text-sam-muted">
                {pickCommissionCopy(lang, "정상 처리된 주문입니다. 수동 정산·지급 조치가 없습니다.", "Processed automatically — no manual settlement action.")}
              </p>
            )
          }
        />
      ) : null}

      <DibayDialog
        open={gateModal != null}
        onClose={() => (busy ? undefined : setGateModal(null))}
        dismissible={!busy}
        title={pickCommissionCopy(lang, "주문 차단 정책 변경", "Change order-block policy")}
        description={gateModal ? STORE_CASH_ORDER_GATE_LABEL[gateModal.mode][lang] : undefined}
        actions={
          gateModal
            ? [
                {
                  key: "cancel",
                  label: gateModal.step === "confirm" ? pickCommissionCopy(lang, "이전", "Back") : pickCommissionCopy(lang, "취소", "Cancel"),
                  roleTone: "secondary",
                  disabled: busy,
                  onClick: () => (gateModal.step === "confirm" ? setGateModal({ ...gateModal, step: "form" }) : setGateModal(null)),
                },
                gateModal.step === "form"
                  ? {
                      key: "next",
                      label: pickCommissionCopy(lang, "다음", "Next"),
                      roleTone: "primary",
                      disabled: busy || gateModal.reason.trim().length < 2,
                      onClick: () => setGateModal({ ...gateModal, step: "confirm" }),
                    }
                  : {
                      key: "confirm",
                      label: pickCommissionCopy(lang, "확인 · 적용", "Confirm"),
                      roleTone: gateModal.mode === "block_when_not_positive" ? "destructive" : "primary",
                      loading: busy,
                      disabled: busy,
                      onClick: () => void submitGate(),
                    },
              ]
            : []
        }
      >
        {gateModal ? (
          <div className="space-y-2 text-left" data-gate-modal={gateModal.step}>
            {gateModal.mode === "block_when_not_positive" ? (
              <p className="rounded-ui-rect bg-sam-danger-soft px-3 py-2 sam-text-helper text-sam-danger">
                {pickCommissionCopy(
                  lang,
                  `적용 즉시 순잔액 0 이하인 매장 ${wouldBlockCount}곳의 신규 주문이 차단됩니다. 이미 받은 주문은 영향 없습니다.`,
                  `${wouldBlockCount} store(s) with net <= 0 stop receiving new orders immediately. Existing orders are unaffected.`
                )}
              </p>
            ) : null}
            {gateModal.step === "form" ? (
              <textarea
                className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                rows={3}
                placeholder={pickCommissionCopy(lang, "변경 사유 (필수)", "Reason (required)")}
                value={gateModal.reason}
                onChange={(e) => setGateModal({ ...gateModal, reason: e.target.value })}
                aria-label="reason"
              />
            ) : (
              <p className="sam-text-helper text-sam-muted">
                {pickCommissionCopy(lang, "사유", "Reason")}: {gateModal.reason}
              </p>
            )}
            {modalError ? <p className="sam-text-helper text-sam-danger" role="alert">{modalError}</p> : null}
          </div>
        ) : null}
      </DibayDialog>

      <DibayDialog
        open={modal != null}
        onClose={() => (busy ? undefined : setModal(null))}
        dismissible={!busy}
        title={pickCommissionCopy(lang, "취소·환불 주문 수수료 결정", "Commission on cancelled/refunded order")}
        description={modal ? `#${modal.row.orderNo} · ${modal.row.storeName} · ${modal.row.orderStatus}` : undefined}
        actions={
          modal
            ? [
                {
                  key: "cancel",
                  label: modal.step === "confirm" ? pickCommissionCopy(lang, "이전", "Back") : pickCommissionCopy(lang, "취소", "Cancel"),
                  roleTone: "secondary",
                  disabled: busy,
                  onClick: () => (modal.step === "confirm" ? setModal({ ...modal, step: "form" }) : setModal(null)),
                },
                modal.step === "form"
                  ? {
                      key: "next",
                      label: pickCommissionCopy(lang, "다음", "Next"),
                      roleTone: "primary",
                      disabled: busy || !decisionValid,
                      onClick: () => setModal({ ...modal, step: "confirm" }),
                    }
                  : {
                      key: "confirm",
                      label:
                        modal.decision === "approve"
                          ? pickCommissionCopy(lang, "환급 승인 확정", "Confirm approval")
                          : pickCommissionCopy(lang, "환급 거절 확정", "Confirm rejection"),
                      roleTone: modal.decision === "approve" ? "primary" : "destructive",
                      loading: busy,
                      disabled: busy,
                      onClick: () => void submitDecision(),
                    },
              ]
            : []
        }
      >
        {modal ? (
          <div className="space-y-3 text-left" data-decision-modal={modal.step}>
            <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
              <CommissionRowMoney row={modal.row} lang={lang} />
            </div>
            {modal.step === "form" ? (
              <>
                <fieldset className="space-y-2">
                  <label
                    className={`flex cursor-pointer touch-manipulation items-start gap-2 rounded-ui-rect border p-3 transition-colors active:bg-sam-surface-muted ${
                      modal.decision === "approve" ? "border-sam-success bg-sam-success-soft" : "border-sam-border-soft"
                    }`}
                  >
                    <input type="radio" name="decision" checked={modal.decision === "approve"} onChange={() => setModal({ ...modal, decision: "approve" })} />
                    <span className="sam-text-helper text-sam-fg">
                      <b>{pickCommissionCopy(lang, "환급 승인", "Approve refund")}</b>
                      <br />
                      {pickCommissionCopy(lang, "미납이 먼저 취소되고, 남은 금액만 실제 차감액 한도로 캐시에 환급됩니다.", "Unpaid is cancelled first; only the remainder returns to Cash, capped at what was paid.")}
                    </span>
                  </label>
                  {modal.decision === "approve" ? (
                    <input
                      inputMode="decimal"
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                      placeholder={pickCommissionCopy(
                        lang,
                        `승인 금액(₱) — 비우면 전액 ${formatCashMinor(modal.row.feePaidMinor + modal.row.feeOutstandingMinor)}`,
                        `Amount (₱) — empty = full ${formatCashMinor(modal.row.feePaidMinor + modal.row.feeOutstandingMinor)}`
                      )}
                      value={modal.amountPhp}
                      onChange={(e) => setModal({ ...modal, amountPhp: e.target.value })}
                      aria-label="amount"
                    />
                  ) : null}
                  <label
                    className={`flex cursor-pointer touch-manipulation items-start gap-2 rounded-ui-rect border p-3 transition-colors active:bg-sam-surface-muted ${
                      modal.decision === "reject" ? "border-sam-danger bg-sam-danger-soft" : "border-sam-border-soft"
                    }`}
                  >
                    <input type="radio" name="decision" checked={modal.decision === "reject"} onChange={() => setModal({ ...modal, decision: "reject" })} />
                    <span className="sam-text-helper text-sam-fg">
                      <b>{pickCommissionCopy(lang, "환급 거절", "Reject refund")}</b>
                      <br />
                      {pickCommissionCopy(lang, "매장 귀책 취소 등. 차감액 유지, 미납이 있으면 계속 청구됩니다.", "e.g. store-fault cancel. Charge stays; unpaid remains owed.")}
                    </span>
                  </label>
                </fieldset>
                <textarea
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                  rows={3}
                  placeholder={pickCommissionCopy(lang, "처리 사유 (필수, 매장에도 표시됨)", "Reason (required, visible to the store)")}
                  value={modal.reason}
                  onChange={(e) => setModal({ ...modal, reason: e.target.value })}
                  aria-label="reason"
                />
              </>
            ) : (
              <div
                className={`rounded-ui-rect border p-3 sam-text-helper text-sam-fg ${
                  modal.decision === "approve" ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"
                }`}
              >
                <p className="font-semibold">{pickCommissionCopy(lang, "이 결정은 되돌릴 수 없습니다.", "This decision is final.")}</p>
                {modal.decision === "approve" && decisionPreview ? (
                  <p>
                    {pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")} {formatCashMinor(decisionPreview.outstandingCancelMinor)} ·{" "}
                    {pickCommissionCopy(lang, "캐시 환급", "Cash refund")} {formatCashMinor(decisionPreview.cashRefundMinor)}
                  </p>
                ) : (
                  <p>{pickCommissionCopy(lang, "환급 없음 — 금액 이동 없음", "No refund — no money moves")}</p>
                )}
                <p className="break-words">
                  {pickCommissionCopy(lang, "사유", "Reason")}: {modal.reason}
                </p>
              </div>
            )}
            {modalError ? <p className="sam-text-helper text-sam-danger" role="alert">{modalError}</p> : null}
          </div>
        ) : null}
      </DibayDialog>
    </div>
  );
}
