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
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
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
  customPeriodInputState,
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
import { commissionOrderStatusLine } from "@/lib/stores/commission/store-commission-display-labels";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translateBy } from "@/lib/i18n/translate-by";

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
  /** L3(환급 승인) 대상 재입력 — 주문번호 */
  retype: string;
  /** One key per opened decision — a double click / retry replays, never re-executes. */
  idempotencyKey: string;
};

const ADJUST_ERROR: Record<string, { ko: string; en: string }> = {
  reason_required: catalogPair("admin_enter_a_reason_2_characters"),
  invalid_amount: catalogPair("admin_amount_must_be_0_and_remaining"),
  not_in_review: catalogPair("admin_already_decided_refresh"),
  order_not_closed: catalogPair("admin_order_is_not_cancelled_refunded"),
  admin_required: catalogPair("admin_stores_fee_err_forbidden"),
  rpc_missing: catalogPair("admin_this_feature_is_not_ready_yet"),
};

const CHECK_LABEL: Record<string, { ko: string; en: string }> = {
  charged_eq_due_plus_adjustments: catalogPair("admin_charged_remaining_approved"),
  cash_ledger_eq_fee_paid: catalogPair("admin_cash_ledger_fee_paid"),
  status_matches_amounts: catalogPair("admin_status_matches_amounts"),
  closed_orders_reviewed: catalogPair("admin_closed_orders_reviewed"),
  balance_eq_ledger_sum: catalogPair("admin_balance_ledger_sum"),
  sale_coin_le_platform_coupon: catalogPair("admin_sale_coin_per_order_platform_coupon"),
};

/** Admin console primary CTA — locked contrast (sam-primary is intentionally washed out under data-admin). */

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type HeadlineLoad = "loading" | "ok" | "error";

/** 카드 값을 받기 전·실패 때 표시 (0 대신) */
function headlineNotReadyCopy(status: HeadlineLoad, lang: CommissionLang): { value: string; sub: string } {
  return status === "loading"
    ? { value: translateBy(lang, "admin_loading", undefined, "en"), sub: "" }
    : {
        value: translateBy(lang, "admin_could_not_load", undefined, "en"),
        sub: translateBy(lang, "admin_please_refresh", undefined, "en"),
      };
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
  const customPeriodState = period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";
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
  /**
   * 카드 값 상태 — 받기 전·실패를 0(정상 색)으로 보이지 않게 (실기 T-8 발견 결함 6).
   * 이전: 미납 ₱0.00·환불 검토 0건이 「불러오는 중/실패」와 구분되지 않았고 실패는 조용히 무시.
   * ledger = 자동 수수료·미납·환불 검토 카드(수수료 목록 응답), integrity = 원장 대조 카드.
   */
  const [headlineStatus, setHeadlineStatus] = useState<{ ledger: HeadlineLoad; integrity: HeadlineLoad }>({
    ledger: "loading",
    integrity: "loading",
  });
  const [loading, setLoading] = useState(true);
  /** Error code (never rendered raw) + HTTP status — mapped through AdminErrorState. */
  const [error, setErrorState] = useState<{ code: string; status?: number } | null>(null);
  const setError = useCallback((code: string | null, status?: number) => {
    setErrorState(code ? { code, status } : null);
  }, []);
  const [selected, setSelected] = useState<StoreCommissionLedgerRow | null>(null);
  const [modal, setModal] = useState<DecisionModal | null>(null);
  /** 주문 차단 정책 변경 실패 문구 — 정책 영역에 표시 (확인창은 confirmAdminAction). */
  const [gateError, setGateError] = useState<string | null>(null);
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

  /** 카드 요청 번호 — 매장을 바꾼 뒤 늦게 온 이전 매장 응답이 카드를 덮지 않게 (D-11 ②). */
  const headlineSeqRef = useRef(0);
  const loadHeadline = useCallback(async () => {
    const seq = ++headlineSeqRef.current;
    const scope = storeId ? `store_id=${encodeURIComponent(storeId)}&` : "";
    // 조회 시작 = 「불러오는 중」 (이전 매장 숫자를 새 매장 카드로 보이지 않게)
    setHeadlineStatus({ ledger: "loading", integrity: "loading" });
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
      if (seq !== headlineSeqRef.current) return;
      setHeadline({
        summary: lj.ok ? lj.summary ?? null : null,
        positions: lj.ok ? lj.positions ?? [] : [],
        integrity: ij.ok ? ij : null,
        exceptionOrders: ej.ok ? ej.totalRows : null,
      });
      setHeadlineStatus({
        ledger: lj.ok && lj.summary ? "ok" : "error",
        integrity: ij.ok && ej.ok ? "ok" : "error",
      });
    } catch {
      if (seq !== headlineSeqRef.current) return;
      // 실패를 숨기지 않는다 — 이전 값이 있어도 카드에 「불러오지 못했습니다」
      setHeadlineStatus({ ledger: "error", integrity: "error" });
    }
  }, [storeId]);

  const load = useCallback(async () => {
    // 「직접」 기간이 덜 골라졌거나 뒤바뀌면 조회하지 않고 안내 (D-12 · 서버도 400 invalid_period)
    if (customPeriodState !== "ok") {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
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
  }, [customPeriodState, effectiveState, group, kinds, offset, orderNo, pageSize, payableAll, period, setError, storeId, tab]);

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
  const ledgerReady = headlineStatus.ledger === "ok";
  const integrityReady = headlineStatus.integrity === "ok";

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

  /**
   * 주문 차단 정책 변경 = L3 (시스템 토글) — 표준 확인창(confirmAdminAction) 한 번에 사유(2자+)·적용.
   * 예전 자체 2단계 DibayDialog(사유 입력 → 확인)와 같은 순서·같은 사유 규칙, 서버 본문도 같다.
   */
  const changeGate = async (mode: StoreCashOrderGateMode) => {
    if (busyRef.current) return;
    setGateError(null);
    const ko = lang === "ko";
    const confirmed = await confirmAdminAction({
      // 신규 주문 일괄 차단 정책 = 긴급 차단과 같은 L3 (동작 표 SSOT)
      level: adminActionLevel("emergencyBlock"),
      ko,
      title: translateBy(lang, "admin_change_order_block_policy", undefined, "en"),
      description: [
        STORE_CASH_ORDER_GATE_LABEL[mode][lang],
        mode === "block_when_not_positive"
          ? translateBy(lang, "admin_store_commission_gate_confirm_block", { n: wouldBlockCount }, "en")
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      confirmLabel: translateBy(lang, "admin_ops_console_btn_apply", undefined, "en"),
      destructive: mode === "block_when_not_positive",
      // 기존 2단계(사유 입력 → 확인)와 같게 — 대상 재입력 단계는 추가하지 않는다.
      reasonPlaceholder: translateBy(lang, "admin_reason_required", undefined, "en"),
    });
    if (!confirmed.ok) return;
    await runOnce(async () => {
      const res = await fetch("/api/admin/store-commission-ledger/gate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode, reason: (confirmed.reason ?? "").trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        const code = res.status === 403 ? "forbidden" : json.error ?? "update_failed";
        setGateError(ADJUST_ERROR[code]?.[lang] ?? adminOperatorErrorMessage(code, ko));
        return;
      }
      await Promise.all([load(), loadHeadline()]);
    });
  };

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
            translateBy(lang, "admin_store_commission_decide_failed", { error: adminOperatorErrorMessage(code, lang === "ko") }, "en")
        );
        setModal({ ...modal, step: "form" });
        return;
      }
      const decidedNo = modal.row.orderNo;
      setModal(null);
      setSelected(null);
      setNotice(
        modal.decision === "approve"
          ? translateBy(lang, "admin_store_commission_refund_approved", {
                no: decidedNo,
                cash: formatCashMinor(json.cashRefundMinor ?? 0),
                unpaid: formatCashMinor(json.outstandingCancelMinor ?? 0),
              }, "en")
          : translateBy(lang, "admin_store_commission_refund_rejected", { no: decidedNo }, "en")
      );
      emitAdminQueueChanged("settlements");
      await Promise.all([load(), loadHeadline()]);
    });

  const openDecision = (row: StoreCommissionLedgerRow) => {
    setModalError(null);
    setModal({ row, decision: null, amountPhp: "", reason: "", step: "form", retype: "", idempotencyKey: newKey() });
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
  /** 확인 단계 = 공용 표 — 환급 승인은 금전 이동(되돌릴 수 없음) L3 · 반려는 L2 */
  const decisionLevel = modal?.decision === "approve" ? adminActionLevel("refund") : adminActionLevel("reject");
  const retypeOk =
    decisionLevel !== "L3" || (modal != null && modal.retype.trim() === String(modal.row.orderNo ?? "").trim());
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
        {translateBy(lang, "admin_decide", undefined, "en")}
      </AdminActionButton>
    ) : null;

  return (
    <div className="min-w-0 space-y-4" data-commission-admin="1">
      <AdminPageHeader
        titleKey="admin_menu_store_settlements"
        description={translateBy(lang, "admin_customers_pay_the_store_directly_there", undefined, "en")}
      />

      {legacyQueueLink ? (
        <div className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 sam-text-helper text-sam-fg" role="status" data-legacy-queue-notice="1">
          {translateBy(lang, "admin_the_per_order_settlement_review_scheduled", undefined, "en")}
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

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={translateBy(lang, "admin_work_cards", undefined, "en")}>
        <WorkCard
          title={translateBy(lang, "admin_auto_commission", undefined, "en")}
          value={
            ledgerReady && headline.summary
              ? formatCashMinor(headline.summary.netCommissionMinor)
              : headlineNotReadyCopy(headlineStatus.ledger, lang).value
          }
          sub={
            ledgerReady
              ? translateBy(lang, "admin_store_commission_head_ledger_sub", { n: headline.summary?.count ?? 0 }, "en")
              : headlineNotReadyCopy(headlineStatus.ledger, lang).sub
          }
          tone="default"
          active={tab === "ledger"}
          onClick={() => setUrl({ tab: "ledger" })}
        />
        <WorkCard
          title={translateBy(lang, "admin_unpaid", undefined, "en")}
          value={ledgerReady ? formatCashMinor(headOutstanding) : headlineNotReadyCopy(headlineStatus.ledger, lang).value}
          sub={
            ledgerReady
              ? translateBy(lang, "admin_store_commission_head_unpaid_sub", { n: headNegative, gate: STORE_CASH_ORDER_GATE_LABEL[gateMode][lang] }, "en")
              : headlineNotReadyCopy(headlineStatus.ledger, lang).sub
          }
          tone={!ledgerReady ? "default" : headOutstanding > 0 ? "danger" : "good"}
          active={tab === "cash"}
          onClick={() => setUrl({ tab: "cash" })}
        />
        <WorkCard
          title={translateBy(lang, "admin_refund_review", undefined, "en")}
          value={
            ledgerReady
              ? translateBy(lang, "admin_store_commission_head_review_count", { n: headline.summary?.reviewCount ?? 0 }, "en")
              : headlineNotReadyCopy(headlineStatus.ledger, lang).value
          }
          sub={
            ledgerReady
              ? translateBy(lang, "admin_store_commission_head_review_sub", { amount: formatCashMinor(headline.summary?.reviewFeeMinor ?? 0) }, "en")
              : headlineNotReadyCopy(headlineStatus.ledger, lang).sub
          }
          tone={!ledgerReady ? "default" : (headline.summary?.reviewCount ?? 0) > 0 ? "warn" : "good"}
          active={tab === "review"}
          onClick={() => setUrl({ tab: "review" })}
        />
        <WorkCard
          title={translateBy(lang, "admin_ledger_check", undefined, "en")}
          value={
            integrityReady && headline.integrity
              ? translateBy(lang, "admin_store_commission_head_check_issues", { n: integrityViolations + (headline.exceptionOrders ?? 0) }, "en")
              : headlineNotReadyCopy(headlineStatus.integrity, lang).value
          }
          sub={
            integrityReady
              ? translateBy(lang, "admin_store_commission_head_check_sub", { violations: integrityViolations, exceptions: headline.exceptionOrders ?? "—" }, "en")
              : headlineNotReadyCopy(headlineStatus.integrity, lang).sub
          }
          tone={!integrityReady ? "default" : integrityViolations + (headline.exceptionOrders ?? 0) > 0 ? "danger" : "good"}
          active={tab === "exceptions"}
          onClick={() => setUrl({ tab: "exceptions" })}
        />
      </section>

      <nav className="flex flex-wrap items-center gap-1.5" aria-label={translateBy(lang, "admin_commission_ledger_tabs", undefined, "en")}>
        {TABS.map((t) => (
          <AdminChipButton selected={tab === t} key={t} aria-current={tab === t ? "page" : undefined} onClick={() => setUrl({ tab: t, state: "" })}>
            {COMMISSION_TAB_LABEL[t][lang]}
            {t === "review" && (headline.summary?.reviewCount ?? 0) > 0 ? ` ${headline.summary?.reviewCount}` : ""}
          </AdminChipButton>
        ))}
        {storeId ? (
          <span className="ml-1 inline-flex items-center gap-2 rounded-full bg-sam-surface-muted px-3 py-1 sam-text-xxs text-sam-fg">
            <span title={storeId}>{storeNames.get(storeId) || translateBy(lang, "admin_selected_store", undefined, "en")}</span>
            <AdminActionButton variant="ghost" size="sm" className="!h-auto !px-0" onClick={() => setUrl({ store_id: "" })}>
              {translateBy(lang, "admin_stores_home_shelves_route_allStores", undefined, "en")}
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

      {customPeriodState !== "ok" ? (
        <p className="sam-text-helper text-sam-danger" role="status" data-admin-commission-custom={customPeriodState}>
          {customPeriodState === "inverted"
            ? translateBy(lang, "admin_start_date_is_after_end_date", undefined, "en")
            : translateBy(lang, "admin_pick_both_start_and_end_dates", undefined, "en")}
        </p>
      ) : null}
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
              {translateBy(lang, "admin_only_orders_cancelled_refunded_after_cooking", undefined, "en")}
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
            searchPlaceholder={translateBy(lang, "admin_users_cc_col_order_no", undefined, "en")}
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
                    ? translateBy(lang, "admin_no_cancelled_refunded_orders_for_this", undefined, "en")
                    : translateBy(lang, "admin_no_commission_rows", undefined, "en")
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
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4" aria-label={translateBy(lang, "admin_commission_policy", undefined, "en")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="sam-text-helper font-medium text-sam-fg">
                {translateBy(lang, "admin_block_new_orders_when_cash_is", undefined, "en")}
              </span>
              {STORE_CASH_ORDER_GATE_MODES.map((mode) => (
                <AdminChipButton
                  selected={gateMode === mode}
                  key={mode}
                  disabled={busy || loading || gateMode === mode}
                  onClick={() => void changeGate(mode)}
                >
                  {STORE_CASH_ORDER_GATE_LABEL[mode][lang]}
                </AdminChipButton>
              ))}
            </div>
            {gateError ? (
              <p className="mt-1 sam-text-helper text-sam-danger" role="alert" data-gate-error="1">
                {gateError}
              </p>
            ) : null}
            {data?.gate?.changedAt ? (
              <p className="mt-1 sam-text-xxs text-sam-muted">
                {translateBy(lang, "admin_last_change", undefined, "en")}: {formatManilaDateTime(data.gate.changedAt)} · {data.gate.reason}
              </p>
            ) : null}
          </section>

          <section className="min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-sam-fg">{translateBy(lang, "admin_cash_unpaid_order_block_by_store", undefined, "en")}</h2>
              <p className="sam-text-xxs text-sam-muted">
                {translateBy(lang, "admin_store_commission_position_summary", { negative: negativeCount, blocked: blockedCount }, "en")}
              </p>
            </div>
            {selectedPosition ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-sam-fg">{storeNames.get(selectedPosition.storeId) || storeId}</p>
                <StoreCashPositionCard position={selectedPosition} lang={lang} />
                <Link href={businessCcFinancialStatementHref(storeId)} className="inline-block sam-text-helper font-medium text-signature underline">
                  {translateBy(lang, "admin_store_financial_statement", undefined, "en")}
                </Link>
              </div>
            ) : (
              <div className="mt-3">
                <HorizontalScrollRegion label={translateBy(lang, "admin_cash_by_store", undefined, "en")} lang={lang}>
                  <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-sm">
                    <thead className="sam-text-xxs text-sam-muted">
                      <tr>
                        <th className="sticky left-0 z-10 border-b border-sam-border-soft bg-sam-app px-3 py-2">{translateBy(lang, "admin_store_3", undefined, "en")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{translateBy(lang, "admin_cash_2", undefined, "en")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{translateBy(lang, "admin_unpaid_2", undefined, "en")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2 text-right">{translateBy(lang, "admin_net", undefined, "en")}</th>
                        <th className="border-b border-sam-border-soft bg-sam-app px-3 py-2">{translateBy(lang, "admin_new_orders", undefined, "en")}</th>
                        <th className="sticky right-0 z-10 border-b border-sam-border-soft bg-sam-app px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPositions.map((p) => {
                        const bg = p.netMinor < 0 ? "bg-sam-danger-soft" : "bg-sam-surface";
                        return (
                          <tr key={p.storeId} data-store-net={p.netMinor < 0 ? "negative" : "ok"}>
                            <td className={`sticky left-0 z-10 border-b border-sam-border-soft px-3 py-2 ${bg}`}>
                              <span className="block max-w-[16rem] break-words">{storeNames.get(p.storeId) || translateBy(lang, "admin_r4d_store_unnamed", undefined, "en")}</span>
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
                                {p.orderable ? translateBy(lang, "admin_open", undefined, "en") : translateBy(lang, "admin_ops_tools_runbook_btn_block", undefined, "en")}
                              </span>
                            </td>
                            <td className={`sticky right-0 z-10 border-b border-sam-border-soft px-3 py-2 text-right ${bg}`}>
                              <AdminActionButton variant="ghost" size="sm" onClick={() => setUrl({ store_id: p.storeId, tab: "ledger" })}>
                                {translateBy(lang, "admin_ledger", undefined, "en")}
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
            <h2 className="text-sm font-semibold text-sam-fg">{translateBy(lang, "admin_cash_transactions", undefined, "en")}</h2>
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
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4" aria-label={translateBy(lang, "admin_integrity_check", undefined, "en")}>
            <h2 className="text-sm font-semibold text-sam-fg">{translateBy(lang, "admin_record_integrity_check", undefined, "en")}</h2>
            <p className="mt-1 sam-text-xxs text-sam-muted">
              {translateBy(lang, "admin_read_only_no_ad_hoc_correction", undefined, "en")}
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
                        {translateBy(lang, "admin_store_commission_legacy_preserved", { n: c.legacyPreserved }, "en")}
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
                    {translateBy(lang, "admin_legacy_rows_without_original_fee_evidence", undefined, "en")}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 sam-text-helper text-sam-muted">{translateBy(lang, "admin_no_result", undefined, "en")}</p>
            )}
            <p className="mt-2 sam-text-xxs text-sam-muted">
              {translateBy(lang, "admin_a_failed_commission_charge_rolls_back", undefined, "en")}
            </p>
          </section>

          <section className="min-w-0 space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sm:p-4">
            <h2 className="text-sm font-semibold text-sam-fg">
              {translateBy(lang, "admin_coin_over_credit_legacy_manual_payouts", undefined, "en")}
            </h2>
            <p className="sam-text-xxs text-sam-muted">
              {translateBy(lang, "admin_orders_whose_coin_exceeds_platform_held", undefined, "en")}
            </p>
            {exceptionsPage ? (
              exceptionsPage.rows.length === 0 ? (
                <AdminEmptyState ko={ko} message={translateBy(lang, "admin_no_exceptions", undefined, "en")} />
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
              {translateBy(lang, "admin_payable_only", undefined, "en")}
            </AdminChipButton>
            <AdminChipButton selected={payableAll} onClick={() => setUrl({ payable: "all" })}>
              {translateBy(lang, "admin_all_completed_orders", undefined, "en")}
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
                  {translateBy(lang, "admin_processed_automatically_no_manual_settlement_act", undefined, "en")}
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
                    {translateBy(lang, "admin_decide_approve_reject", undefined, "en")}
                  </AdminActionButton>
                ) : null}
              </div>
            </div>
          }
        />
      ) : null}

      <DibayDialog
        open={modal != null}
        onClose={() => (busy ? undefined : setModal(null))}
        dismissible={!busy}
        title={translateBy(lang, "admin_commission_on_cancelled_refunded_order", undefined, "en")}
        description={modal ? `#${modal.row.orderNo} · ${modal.row.storeName} · ${commissionOrderStatusLine(modal.row, lang)}` : undefined}
        actions={
          modal
            ? [
                {
                  key: "cancel",
                  label: modal.step === "confirm" ? translateBy(lang, "admin_ad_delete_back", undefined, "en") : translateBy(lang, "admin_cancel", undefined, "en"),
                  roleTone: "secondary",
                  disabled: busy,
                  onClick: () => (modal.step === "confirm" ? setModal({ ...modal, step: "form" }) : setModal(null)),
                },
                modal.step === "form"
                  ? {
                      key: "next",
                      label: translateBy(lang, "admin_ad_delete_next", undefined, "en"),
                      roleTone: "primary",
                      disabled: busy || !decisionValid,
                      onClick: () => setModal({ ...modal, step: "confirm" }),
                    }
                  : {
                      key: "confirm",
                      label:
                        modal.decision === "approve"
                          ? translateBy(lang, "admin_confirm_approval", undefined, "en")
                          : translateBy(lang, "admin_confirm_rejection", undefined, "en"),
                      roleTone: modal.decision === "approve" ? "primary" : "destructive",
                      loading: busy,
                      disabled: busy || !retypeOk,
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
                      <b>{translateBy(lang, "admin_approve_refund", undefined, "en")}</b>
                      <br />
                      {translateBy(lang, "admin_unpaid_is_cancelled_first_only_the", undefined, "en")}
                    </span>
                  </label>
                  {modal.decision === "approve" ? (
                    <input
                      inputMode="decimal"
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                      placeholder={translateBy(lang, "admin_store_commission_approve_amount_placeholder", { full: formatCashMinor(modal.row.feePaidMinor + modal.row.feeOutstandingMinor) }, "en")}
                      value={modal.amountPhp}
                      onChange={(e) => setModal({ ...modal, amountPhp: e.target.value })}
                      aria-label={translateBy(lang, "admin_approved_amount", undefined, "en")}
                    />
                  ) : null}
                  <label
                    className={`flex cursor-pointer touch-manipulation items-start gap-2 rounded-ui-rect border p-3 transition-colors active:bg-sam-surface-muted ${
                      modal.decision === "reject" ? "border-sam-danger bg-sam-danger-soft" : "border-sam-border-soft"
                    }`}
                  >
                    <input type="radio" name="decision" checked={modal.decision === "reject"} onChange={() => setModal({ ...modal, decision: "reject" })} />
                    <span className="sam-text-helper text-sam-fg">
                      <b>{translateBy(lang, "admin_reject_refund", undefined, "en")}</b>
                      <br />
                      {translateBy(lang, "admin_e_g_store_fault_cancel_charge", undefined, "en")}
                    </span>
                  </label>
                </fieldset>
                <textarea
                  className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-fg"
                  rows={3}
                  placeholder={translateBy(lang, "admin_reason_required_visible_to_the_store", undefined, "en")}
                  value={modal.reason}
                  onChange={(e) => setModal({ ...modal, reason: e.target.value })}
                  aria-label={translateBy(lang, "admin_chat_sheet_reason_label", undefined, "en")}
                />
              </>
            ) : (
              <div
                className={`rounded-ui-rect border p-3 sam-text-helper text-sam-fg ${
                  modal.decision === "approve" ? "border-sam-success bg-sam-success-soft" : "border-sam-danger bg-sam-danger-soft"
                }`}
              >
                <p className="font-semibold">{translateBy(lang, "admin_this_decision_is_final", undefined, "en")}</p>
                {modal.decision === "approve" && decisionPreview ? (
                  <p>
                    {translateBy(lang, "admin_unpaid_cancelled", undefined, "en")} {formatCashMinor(decisionPreview.outstandingCancelMinor)} ·{" "}
                    {translateBy(lang, "admin_cash_refund", undefined, "en")} {formatCashMinor(decisionPreview.cashRefundMinor)}
                  </p>
                ) : (
                  <p>{translateBy(lang, "admin_no_refund_no_money_moves", undefined, "en")}</p>
                )}
                <p className="break-words">
                  {translateBy(lang, "admin_reason_2", undefined, "en")}: {modal.reason}
                </p>
                {decisionLevel === "L3" ? (
                  <label className="mt-2 block" data-decision-retype="1">
                    <span className="block">
                      {translateBy(lang, "admin_store_commission_retype_order_no", { no: modal.row.orderNo }, "en")}
                    </span>
                    <input
                      className="mt-1 min-h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 font-mono text-sm text-sam-fg"
                      value={modal.retype}
                      onChange={(e) => setModal({ ...modal, retype: e.target.value })}
                      aria-label={translateBy(lang, "admin_re_type_order_number", undefined, "en")}
                      autoComplete="off"
                    />
                  </label>
                ) : null}
              </div>
            )}
            {modalError ? <p className="sam-text-helper text-sam-danger" role="alert">{modalError}</p> : null}
          </div>
        ) : null}
      </DibayDialog>
    </div>
  );
}
