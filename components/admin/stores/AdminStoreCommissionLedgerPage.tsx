"use client";

/**
 * Admin — 배달 정산 = 매장 수수료 · 캐시 원장 (`/admin/store-settlements`).
 *
 * 매장 직접 결제 모델: 정상 주문에는 수동 "정산/지급" CTA 가 없다.
 * - 조리 시작 시 수수료 자동 부과·캐시 차감 (DB 트리거, 부족분은 미납 → 순잔액 마이너스)
 * - 관리자 개입: 취소·환불 수수료 결정(승인 전액/부분 · 반려) + 캐시 부족 주문 차단 정책 + 금융 예외 확인
 * - 원장 직접 수정 기능 없음 — 정정은 결정 기록으로만
 * Owner 화면과 같은 SQL 함수·컴포넌트(StoreCommissionLedgerParts / StoreCommissionLedgerTable)를 쓴다.
 */
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  normalizeAdminListPage,
  normalizeAdminListPageSize,
  type AdminListPageSize,
} from "@/lib/admin/list-query/admin-list-query";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { DibayDialog } from "@/components/ui/dibay-overlay";
import {
  phpToCashMinor,
  splitStoreCommissionApproval,
  STORE_CASH_ORDER_GATE_LABEL,
  STORE_CASH_ORDER_GATE_MODES,
  STORE_COMMISSION_FILTER_STATES,
  sumStoreCashOutstandingMinor,
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
  formatManilaDateTime,
  parseStoreCommissionPeriodParams,
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
  formatCashMinor,
  COMMISSION_REVIEW_FILTERS,
  pickCommissionCopy,
  PlatformPayableSummaryGrid,
  PlatformPayableTable,
  resolveCommissionTab,
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
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";

/** 기본 페이지 크기 (예전 고정값 100 유지) — 주소 `size` 로 20/50/100 선택, `page` 는 1부터. */
const DEFAULT_PAGE_SIZE: AdminListPageSize = 100;
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
  /** B-2: 수수료 조정 결정 권한 (super_admin). */
  viewer?: { can_decide_adjustment?: boolean };
};

type CashResponse = StoreCashLedgerPage & { ok: boolean; error?: string };
type PayableResponse = StorePlatformPayablePage & { ok: boolean; error?: string };

type IntegrityResponse = {
  ok: boolean;
  obligations?: number;
  checks?: Record<string, { violations: number; ids: string[]; legacyPreserved?: number; newViolations?: number }>;
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
  rpc_missing: { ko: "기능 준비 중입니다. 시스템 관리자에게 문의하세요.", en: "This feature is not ready yet. Contact a system admin." },
};

const CHECK_LABEL: Record<string, { ko: string; en: string }> = {
  charged_eq_due_plus_adjustments: { ko: "원부과액 = 잔여 부과 + 승인 환급", en: "Charged = remaining + approved" },
  cash_ledger_eq_fee_paid: { ko: "캐시 원장 차감액 = 수수료 납부액", en: "Cash ledger = fee paid" },
  status_matches_amounts: { ko: "상태 = 금액 일치", en: "Status matches amounts" },
  closed_orders_reviewed: { ko: "취소·환불 주문 수수료 검토 누락 없음", en: "Closed orders reviewed" },
  balance_eq_ledger_sum: { ko: "캐시 잔액 = 원장 합계", en: "Balance = ledger sum" },
};

/** Admin console primary CTA — locked contrast (sam-primary is intentionally washed out under data-admin). */

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
    <AdminActionButton
      variant="secondary"
      className={`!h-auto min-w-0 !flex-col !items-start !justify-start !whitespace-normal p-3 text-left font-normal ${active ? "!border-signature bg-signature/5" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <p className="sam-text-xxs font-semibold text-sam-muted">{title}</p>
      <p className={`mt-0.5 text-[16px] font-bold tabular-nums ${valueTone}`}>{value}</p>
      <p className="break-words sam-text-xxs text-sam-muted">{sub}</p>
    </AdminActionButton>
  );
}

export function AdminStoreCommissionLedgerPage() {
  const { language, t } = useI18n();
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

  // 목록 조건 = 주소 (R7) — 기간 `period`·`from`·`to` · 상태 `state` · 검토 `review` · 주문번호 `order_no` ·
  // 캐시 종류 `kinds` · 지급 보기 `payable=all` · 쪽 `page`·`size`. 새로고침·링크 공유·상세 복귀 시 그대로 열린다.
  // (통합 대시보드 「순 수수료」 링크가 같은 기간을 연다)
  const periodRaw = parseStoreCommissionPeriodParams(searchParams);
  const periodKey = `${periodRaw.period}|${periodRaw.fromDay ?? ""}|${periodRaw.toDay ?? ""}`;
  const period = useMemo<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>(() => {
    const [p, f, t] = periodKey.split("|");
    return { period: p as StoreCommissionPeriod, fromDay: f, toDay: t };
  }, [periodKey]);
  // 「수수료 원장」 탭을 명시하면 `state=review_required` 도 원장 필터로 쓴다 (탭 없이 오면 환불 검토 탭으로 연다).
  const ledgerState: StoreCommissionLedgerFilterState = tab === "ledger" || urlState !== "review_required" ? urlState : "all";
  const reviewParam = searchParams.get("review")?.trim() ?? "";
  const reviewFilter: CommissionReviewFilter =
    resolved.review ??
    ((COMMISSION_REVIEW_FILTERS as readonly string[]).includes(reviewParam) ? (reviewParam as CommissionReviewFilter) : "review_required");
  // Admin alert deep link: ?order_no=…&open=<obligation id> → filter to the order and open its detail.
  const orderNo = searchParams.get("order_no")?.trim() ?? "";
  const [orderNoDraft, setOrderNoDraft] = useState(orderNo);
  useEffect(() => setOrderNoDraft(orderNo), [orderNo]);
  const openParam = searchParams.get("open")?.trim() ?? "";
  const openedFromLinkRef = useRef<string | null>(null);
  const kindsParam = searchParams.get("kinds")?.trim() ?? "";
  const kinds = useMemo<BusinessCashLedgerKind[]>(
    () => (kindsParam ? (kindsParam.split(",").filter(Boolean) as BusinessCashLedgerKind[]) : []),
    [kindsParam]
  );
  const payableAll = searchParams.get("payable") === "all";
  const pageSize = normalizeAdminListPageSize(searchParams.get("size"), DEFAULT_PAGE_SIZE);
  const page = normalizeAdminListPage(searchParams.get("page"));
  const offset = (page - 1) * pageSize;
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [cash, setCash] = useState<CashResponse | null>(null);
  const [payable, setPayable] = useState<PayableResponse | null>(null);
  const [exceptionsPage, setExceptionsPage] = useState<PayableResponse | null>(null);
  const [group, setGroup] = useState<CommissionBreakdownGroup>("day");
  const [headline, setHeadline] = useState<Headline>({ summary: null, positions: [], integrity: null, exceptionOrders: null });
  const [loading, setLoading] = useState(true);
  /** Error code (never rendered raw) + HTTP status — mapped through AdminErrorState. */
  const [error, setErrorState] = useState<{ code: string; status?: number } | null>(null);
  const setError = useCallback((code: string | null, status?: number) => {
    setErrorState(code ? { code, status } : null);
  }, []);
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
      // 조건이 바뀌면 1쪽으로 (쪽 이동 자체는 `page` 를 넘긴다).
      if (!("page" in next)) sp.delete("page");
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "all") sp.set(k, v);
        else sp.delete(k);
      }
      setSelected(null);
      router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
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
        limit: listTab ? pageSize : 1,
        offset: listTab ? offset : 0,
      });
      const ledgerReq = fetch(`/api/admin/store-commission-ledger?${ledgerQs}`, { credentials: "include" });
      const pagedQs = buildStoreCommissionLedgerSearch({ ...common, limit: pageSize, offset });
      const cashReq =
        tab === "cash"
          ? fetch(
              `/api/admin/store-commission-ledger/cash-ledger?${buildStoreCommissionLedgerSearch({ ...common, kinds, limit: pageSize, offset })}`,
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
        // 실패해도 직전 목록은 지우지 않는다 (§8-5).
        setError(json.error ?? "load_failed", res.status);
        return;
      }
      setData(json);
      if (cashReq) {
        const c = await cashReq;
        const cj = (await c.json()) as CashResponse;
        if (!c.ok || !cj.ok) setError(cj.error ?? "load_failed", c.status);
        else setCash(cj);
      }
      if (payableReq) {
        const pr = await payableReq;
        const pj = (await pr.json()) as PayableResponse;
        if (!pr.ok || !pj.ok) setError(pj.error ?? "load_failed", pr.status);
        else setPayable(pj);
      }
      if (exceptionsReq) {
        const er = await exceptionsReq;
        const ej = (await er.json()) as PayableResponse;
        if (!er.ok || !ej.ok) setError(ej.error ?? "load_failed", er.status);
        else setExceptionsPage(ej);
      }
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [effectiveState, group, kinds, offset, orderNo, pageSize, payableAll, period, setError, storeId, tab]);

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
  const headOutstanding = sumStoreCashOutstandingMinor(headline.positions);
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
        const code = res.status === 403 ? "forbidden" : json.error ?? "update_failed";
        setModalError(ADJUST_ERROR[code]?.[lang] ?? adminOperatorErrorMessage(code, lang === "ko"));
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
        const code =
          res.status === 403 ? (json.error === "super_admin_only" ? "super_admin_only" : "forbidden") : json.error ?? "update_failed";
        setModalError(
          (code === "super_admin_only" ? t("admin_r4c_ledger_decide_super_only") : null) ??
            ADJUST_ERROR[code]?.[lang] ??
            pickCommissionCopy(
              lang,
              `처리하지 못했습니다. 입력 내용은 그대로 두었습니다. ${adminOperatorErrorMessage(code, true)}`,
              `Not saved. Your input is kept — please try again. ${adminOperatorErrorMessage(code, false)}`
            )
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
          : pickCommissionCopy(lang, `#${decidedNo} 환급 반려 완료 — 금액 이동 없음`, `#${decidedNo} refund rejected — no money moved`)
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

  /** B-2: 서버 응답 기준 — 값이 없으면(구 서버) 잠그지 않고 서버 403 에 맡긴다. */
  const canDecide = data?.viewer?.can_decide_adjustment !== false;
  const decideLockedTitle = canDecide ? undefined : t("admin_r4c_ledger_decide_super_only");

  const ko = lang === "ko";
  const listFiltered = ledgerState !== "all" || reviewFilter !== "review_required" || Boolean(orderNo) || period.period !== "all";
  const resetListFilters = () => setUrl({ state: "", review: "", order_no: "", period: "", from: "", to: "", kinds: "", payable: "" });
  const pager = (total: number) =>
    total > 0 ? (
      <AdminPagination
        ko={ko}
        page={page}
        size={pageSize}
        total={total}
        disabled={loading}
        onPageChange={(p) => setUrl({ page: p > 1 ? String(p) : "" })}
        onSizeChange={(size) => setUrl({ size: size === DEFAULT_PAGE_SIZE ? "" : String(size) })}
      />
    ) : null;

  const decideButton = (r: StoreCommissionLedgerRow) =>
    r.state === "review_required" ? (
      <AdminActionButton variant="ghost" size="sm" disabled={busy || !canDecide} title={decideLockedTitle} onClick={() => openDecision(r)}>
        {pickCommissionCopy(lang, "수수료 결정", "Decide")}
      </AdminActionButton>
    ) : null;

  return (
    <div className="min-w-0 space-y-4" data-commission-admin="1">
      <AdminPageHeader
        titleKey="admin_menu_store_settlements"
        description={pickCommissionCopy(
          lang,
          "고객은 매장에 직접 결제합니다. 주문별 지급은 없고, 수수료는 주문 진행 시 자동 부과됩니다.",
          "Customers pay the store directly. There is no per-order payout; the fee is charged automatically as the order progresses."
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
          <AdminActionButton variant="quiet" size="sm" onClick={() => setNotice(null)}>
            {adminCta("close", lang === "ko")}
          </AdminActionButton>
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
          <AdminChipButton selected={tab === t} key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setUrl({ tab: t, state: "" })}>
            {COMMISSION_TAB_LABEL[t][lang]}
            {t === "review" && (headline.summary?.reviewCount ?? 0) > 0 ? ` ${headline.summary?.reviewCount}` : ""}
          </AdminChipButton>
        ))}
        {storeId ? (
          <span className="ml-1 inline-flex items-center gap-2 rounded-full bg-sam-surface-muted px-3 py-1 sam-text-xxs text-sam-fg">
            <span title={storeId}>{storeNames.get(storeId) || pickCommissionCopy(lang, "선택한 매장", "Selected store")}</span>
            <AdminActionButton variant="ghost" size="sm" className="!h-auto !px-0" onClick={() => setUrl({ store_id: "" })}>
              {pickCommissionCopy(lang, "전체 매장", "All stores")}
            </AdminActionButton>
          </span>
        ) : null}
      </nav>

      <CommissionPeriodFilter
        period={period.period}
        fromDay={period.fromDay}
        toDay={period.toDay}
        lang={lang}
        onChange={(p) =>
          setUrl({
            period: p.period,
            from: p.period === "custom" ? p.fromDay : "",
            to: p.period === "custom" ? p.toDay : "",
          })
        }
      />

      {error ? <AdminErrorState ko={lang === "ko"} code={error.code} httpStatus={error.status} onRetry={() => void load()} /> : null}

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
          <div className="flex justify-end">
            <AdminActionButton variant="secondary" size="sm" onClick={() => void load()} disabled={loading} data-ledger-refresh="1">
              {adminCta("refresh", ko)}
            </AdminActionButton>
          </div>
          <AdminFilterBar
            ko={ko}
            draft={{ q: orderNoDraft, from: "", to: "" }}
            onDraftChange={(d) => {
              if (d.q !== undefined) setOrderNoDraft(d.q);
            }}
            onSubmit={() => setUrl({ order_no: orderNoDraft.trim() })}
            onReset={() => {
              setOrderNoDraft("");
              resetListFilters();
            }}
            pending={loading}
            showPeriod={false}
            searchPlaceholder={pickCommissionCopy(lang, "주문번호", "Order no.")}
          >
            {tab === "ledger" ? (
              <CommissionFilterChips value={ledgerState} lang={lang} onChange={(st) => setUrl({ state: st, tab: "ledger" })} />
            ) : (
              <CommissionReviewFilterChips
                value={reviewFilter}
                lang={lang}
                reviewCount={headline.summary?.reviewCount}
                onChange={(f) => setUrl({ review: f === "review_required" ? "" : f, ...(searchParams.get("tab") === "decided" ? { tab: "review" } : {}) })}
              />
            )}
          </AdminFilterBar>
          {loading && rows.length === 0 ? (
            <AdminLoadingState ko={ko} />
          ) : rows.length === 0 ? (
            error ? null : (
              <AdminEmptyState
                ko={ko}
                message={
                  tab === "review"
                    ? pickCommissionCopy(lang, "해당 조건의 취소·환불 건이 없습니다.", "No cancelled/refunded orders for this filter.")
                    : pickCommissionCopy(lang, "해당하는 수수료 내역이 없습니다.", "No commission rows.")
                }
                onReset={listFiltered ? resetListFilters : undefined}
              />
            )
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
          {pager(totalRows)}
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
                <AdminChipButton
                  selected={gateMode === mode}
                  key={mode}
                  disabled={busy || loading || gateMode === mode}
                  onClick={() => {
                    setModalError(null);
                    setGateModal({ mode, reason: "", step: "form" });
                  }}
                >
                  {STORE_CASH_ORDER_GATE_LABEL[mode][lang]}
                </AdminChipButton>
              ))}
            </div>
            {data?.gate?.changedAt ? (
              <p className="mt-1 sam-text-xxs text-sam-muted">
                {pickCommissionCopy(lang, "최근 변경", "Last change")}: {formatManilaDateTime(data.gate.changedAt)} · {data.gate.reason}
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
                              <span className="block max-w-[16rem] break-words">{storeNames.get(p.storeId) || pickCommissionCopy(lang, "이름 없는 매장", "Unnamed store")}</span>
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
                              <AdminActionButton variant="ghost" size="sm" onClick={() => setUrl({ store_id: p.storeId, tab: "ledger" })}>
                                {pickCommissionCopy(lang, "원장 보기", "Ledger")}
                              </AdminActionButton>
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
              onChange={(k) => setUrl({ kinds: k.join(",") })}
            />
            {cash ? <CashLedgerView page={cash} lang={lang} showStore={!storeId} /> : loading ? <AdminLoadingState ko={ko} /> : null}
            {cash ? pager(cash.totalRows) : null}
          </section>
        </>
      ) : null}

      {tab === "exceptions" ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4" aria-label="integrity">
            <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "기록 무결성 검사", "Record integrity check")}</h2>
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
                  <li
                    key={k}
                    className={
                      c.violations === 0
                        ? "text-sam-success"
                        : (c.newViolations ?? c.violations) > 0
                          ? "font-semibold text-sam-danger"
                          : "text-sam-warning"
                    }
                    data-integrity-check={k}
                  >
                    {c.violations === 0 ? "PASS" : `FAIL ${c.violations}`} · {CHECK_LABEL[k]?.[lang] ?? k}
                    {(c.legacyPreserved ?? 0) > 0 ? (
                      <span className="ml-1 sam-text-xxs font-normal" data-integrity-legacy-preserved={c.legacyPreserved}>
                        {pickCommissionCopy(
                          lang,
                          `· 과거 기록 보존 ${c.legacyPreserved}건(정정 안 함·알림 제외)`,
                          `· ${c.legacyPreserved} legacy preserved (not corrected, not alerted)`
                        )}
                      </span>
                    ) : null}
                    {c.violations > 0 ? (
                      <span className="ml-1 break-all sam-text-xxs font-normal">
                        ({c.ids.slice(0, 5).map((id) => storeNames.get(id) ?? formatAdminShortId(id)).join(", ")})
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
                <AdminEmptyState ko={ko} message={pickCommissionCopy(lang, "예외 없음", "No exceptions")} />
              ) : (
                <PlatformPayableTable page={exceptionsPage} lang={lang} showStore={!storeId} />
              )
            ) : error ? null : (
              <AdminLoadingState ko={ko} />
            )}
            {exceptionsPage ? pager(exceptionsPage.totalRows) : null}
          </section>
        </>
      ) : null}

      {tab === "payable" ? (
        <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
          {data?.payableSummary ? <PlatformPayableSummaryGrid summary={data.payableSummary} lang={lang} /> : null}
          <div className="flex flex-wrap gap-1.5">
            <AdminChipButton selected={!payableAll} onClick={() => setUrl({ payable: "" })}>
              {pickCommissionCopy(lang, "지급 의무만", "Payable only")}
            </AdminChipButton>
            <AdminChipButton selected={payableAll} onClick={() => setUrl({ payable: "all" })}>
              {pickCommissionCopy(lang, "완료 주문 전체", "All completed orders")}
            </AdminChipButton>
          </div>
          {payable ? <PlatformPayableTable page={payable} lang={lang} showStore={!storeId} /> : error ? null : <AdminLoadingState ko={ko} />}
          {payable ? pager(payable.totalRows) : null}
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
            // 하단 표준 배치 — 왼쪽 [닫기] · 오른쪽 [주 동작] 1개
            <div className="space-y-2">
              {selected.state === "review_required" ? null : (
                <p className="sam-text-xxs text-sam-muted">
                  {pickCommissionCopy(lang, "정상 처리된 주문입니다. 수동 정산·지급 조치가 없습니다.", "Processed automatically — no manual settlement action.")}
                </p>
              )}
              <div className="flex items-center gap-2" data-commission-detail-footer="1">
                <AdminActionButton variant="secondary" disabled={busy} onClick={() => setSelected(null)}>
                  {adminCta("close", ko)}
                </AdminActionButton>
                {selected.state === "review_required" ? (
                  <AdminActionButton
                    variant="primary"
                    className="ml-auto"
                    disabled={busy || !canDecide}
                    title={decideLockedTitle}
                    onClick={() => openDecision(selected)}
                  >
                    {pickCommissionCopy(lang, "수수료 결정 (승인 · 반려)", "Decide (approve · reject)")}
                  </AdminActionButton>
                ) : null}
              </div>
            </div>
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
                          : pickCommissionCopy(lang, "환급 반려 확정", "Confirm rejection"),
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
                      <b>{pickCommissionCopy(lang, "환급 반려", "Reject refund")}</b>
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
