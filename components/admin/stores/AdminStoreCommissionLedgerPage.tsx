"use client";

/**
 * Admin — 배달 정산 = 매장 수수료 · 캐시 원장 (`/admin/store-settlements`).
 *
 * 매장 직접 결제 모델: 주문별 "지급/정산" 버튼 없음.
 * - 조리 시작 시 수수료 자동 부과·캐시 차감 (DB 트리거, 부족분은 미납 → 순잔액 마이너스)
 * - 관리자 수동 작업: 취소·환불 수수료 결정(승인 전액/부분 · 거절) + 주문 차단 정책
 * - 원장 직접 수정 기능 없음 — 정정은 별도 결정/반대 거래로만
 * Owner 화면과 같은 SQL 함수·컴포넌트(StoreCommissionLedgerParts)를 쓴다.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { businessCcFinancialStatementHref } from "@/lib/admin-business/business-control-center-links";
import { Sam } from "@/lib/ui/sam-component-classes";
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
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import {
  buildStoreCommissionLedgerSearch,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  CashLedgerKindChips,
  CashLedgerView,
  COMMISSION_TAB_LABEL,
  CommissionFilterChips,
  CommissionPeriodFilter,
  CommissionRowMoney,
  CommissionStateChip,
  CommissionSummaryGrid,
  chipClass,
  formatCashMinor,
  LedgerPager,
  pickCommissionCopy,
  StoreCashPositionCard,
  tabLedgerState,
  type CommissionLang,
  type CommissionTab,
} from "@/components/stores/commission/StoreCommissionLedgerParts";

const PAGE_SIZE = 100;
const TABS: CommissionTab[] = ["overview", "ledger", "review", "decided", "cash"];

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
};

type CashResponse = StoreCashLedgerPage & { ok: boolean; error?: string };

type IntegrityResponse = {
  ok: boolean;
  obligations?: number;
  checks?: Record<string, { violations: number; ids: string[] }>;
  originalUnknown?: { count: number; ids: string[] };
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

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function AdminStoreCommissionLedgerPage() {
  const { language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const router = useRouter();
  const searchParams = useSearchParams();

  const storeId = searchParams.get("store_id")?.trim() ?? "";
  const stateParam = (searchParams.get("state")?.trim() ?? "all") as StoreCommissionLedgerFilterState;
  const urlState = STORE_COMMISSION_FILTER_STATES.includes(stateParam) ? stateParam : "all";
  const tabParam = searchParams.get("tab")?.trim() as CommissionTab | undefined;
  const tab: CommissionTab =
    tabParam && TABS.includes(tabParam) ? tabParam : urlState === "review_required" ? "review" : storeId ? "ledger" : "overview";

  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: "all",
    fromDay: "",
    toDay: "",
  });
  const [ledgerState, setLedgerState] = useState<StoreCommissionLedgerFilterState>(urlState);
  const [orderNo, setOrderNo] = useState("");
  const [kinds, setKinds] = useState<BusinessCashLedgerKind[]>([]);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [cash, setCash] = useState<CashResponse | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<DecisionModal | null>(null);
  const [gateModal, setGateModal] = useState<GateModal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const setUrl = useCallback(
    (next: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v && v !== "all") sp.set(k, v);
        else sp.delete(k);
      }
      setOffset(0);
      router.replace(`/admin/store-settlements${sp.toString() ? `?${sp}` : ""}`);
    },
    [router, searchParams]
  );

  const effectiveState = tabLedgerState(tab, ledgerState);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Overview always shows all-time totals; the other tabs follow the period filter.
      const common =
        tab === "overview"
          ? { storeId, period: "all" as const, fromDay: "", toDay: "" }
          : { storeId, period: period.period, fromDay: period.fromDay, toDay: period.toDay };
      const ledgerQs = buildStoreCommissionLedgerSearch({
        ...common,
        state: effectiveState,
        orderNo: orderNo || null,
        limit: PAGE_SIZE,
        offset: tab === "cash" ? 0 : offset,
      });
      const ledgerReq = fetch(`/api/admin/store-commission-ledger?${ledgerQs}`, { credentials: "include" });
      const cashReq =
        tab === "cash"
          ? fetch(
              `/api/admin/store-commission-ledger/cash-ledger?${buildStoreCommissionLedgerSearch({ ...common, kinds, limit: PAGE_SIZE, offset })}`,
              { credentials: "include" }
            )
          : null;
      const integrityReq =
        tab === "overview"
          ? fetch(`/api/admin/store-commission-ledger/integrity${storeId ? `?store_id=${encodeURIComponent(storeId)}` : ""}`, {
              credentials: "include",
            })
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
      if (integrityReq) {
        const i = await integrityReq;
        setIntegrity((await i.json()) as IntegrityResponse);
      }
    } catch {
      setError("network_error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveState, kinds, offset, orderNo, period, storeId, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const positions = useMemo(() => data?.positions ?? [], [data?.positions]);
  const sortedPositions = useMemo(() => [...positions].sort((a, b) => a.netMinor - b.netMinor), [positions]);
  const storeNames = useMemo(() => new Map(Object.entries(data?.storeNames ?? {})), [data?.storeNames]);
  const selectedPosition = storeId ? positions.find((p) => p.storeId === storeId) ?? null : null;
  const blockedCount = positions.filter((p) => !p.orderable).length;
  const negativeCount = positions.filter((p) => p.netMinor < 0).length;
  const wouldBlockCount = positions.filter((p) => p.netMinor <= 0).length;

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
      await load();
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
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        const code = json.error ?? `HTTP ${res.status}`;
        setModalError(ADJUST_ERROR[code]?.[lang] ?? code);
        setModal({ ...modal, step: "form" });
        return;
      }
      setModal(null);
      emitAdminQueueChanged("settlements");
      await load();
    });

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

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={pickCommissionCopy(lang, "배달 정산 · 매장 수수료 원장", "Delivery settlement · Store commission ledger")}
        description={pickCommissionCopy(
          lang,
          "고객은 매장에 직접 결제합니다(COD·GCash·계좌이체). 수수료는 조리 시작 시 매장 캐시에서 자동 부과·차감되며 주문별 지급 처리는 없습니다. 관리자는 취소·환불 수수료 결정과 주문 차단 정책만 처리합니다. 원장은 수정할 수 없고 모든 정정은 별도 결정 기록으로 남습니다.",
          "Buyers pay the store directly. Commission is auto-charged from the store's Cash at cooking start; there is no per-order payout. Admins only decide cancel/refund commission and the order-block policy. Ledgers are append-only."
        )}
      />

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" aria-label="policy">
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
          <p className="mt-1 sam-text-xxs text-sam-meta">
            {pickCommissionCopy(lang, "최근 변경", "Last change")}: {data.gate.changedAt.slice(0, 16).replace("T", " ")} UTC · {data.gate.reason}
          </p>
        ) : null}
      </section>

      <nav className="flex flex-wrap gap-1.5" aria-label="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={chipClass(tab === t)} onClick={() => setUrl({ tab: t, state: "" })}>
            {COMMISSION_TAB_LABEL[t][lang]}
            {t === "review" && (data?.summary?.reviewCount ?? 0) > 0 && tab !== "review" ? ` ${data?.summary?.reviewCount}` : ""}
          </button>
        ))}
        {storeId ? (
          <button type="button" className="ml-2 sam-text-xxs font-medium text-signature underline" onClick={() => setUrl({ store_id: "" })}>
            {pickCommissionCopy(lang, "전체 매장 보기", "All stores")}
          </button>
        ) : null}
      </nav>

      {tab !== "overview" ? (
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
      ) : null}

      {error ? <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {tab === "overview" ? (
        <>
          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "매장별 캐시 현황", "Cash by store")}</h2>
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
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="sam-text-xxs text-sam-muted">
                    <tr>
                      <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "매장", "Store")}</th>
                      <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "캐시 잔액", "Cash")}</th>
                      <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "미납", "Unpaid")}</th>
                      <th className="py-1.5 pr-3 text-right">{pickCommissionCopy(lang, "순잔액", "Net")}</th>
                      <th className="py-1.5 pr-3">{pickCommissionCopy(lang, "신규 주문", "New orders")}</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPositions.map((p) => (
                      <tr key={p.storeId} className="border-t border-sam-border-soft">
                        <td className="py-1.5 pr-3">{storeNames.get(p.storeId) || p.storeId.slice(0, 8)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatCashMinor(p.balanceMinor)}</td>
                        <td className={`py-1.5 pr-3 text-right tabular-nums ${p.outstandingMinor > 0 ? "text-red-700" : ""}`}>
                          {formatCashMinor(p.outstandingMinor)}
                        </td>
                        <td className={`py-1.5 pr-3 text-right font-semibold tabular-nums ${p.netMinor < 0 ? "text-red-700" : "text-sam-fg"}`}>
                          {formatCashMinor(p.netMinor)}
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className={`sam-text-xxs font-semibold ${p.orderable ? "text-emerald-800" : "text-red-700"}`}>
                            {p.orderable ? pickCommissionCopy(lang, "접수 가능", "Open") : pickCommissionCopy(lang, "차단", "Blocked")}
                          </span>
                        </td>
                        <td className="py-1.5 text-right">
                          <button type="button" className="sam-text-xxs font-medium text-signature underline" onClick={() => setUrl({ store_id: p.storeId, tab: "ledger" })}>
                            {pickCommissionCopy(lang, "원장 보기", "Ledger")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "수수료 합계 (전체 기간)", "Commission totals (all time)")}</h2>
            <div className="mt-3">{data?.summary ? <CommissionSummaryGrid summary={data.summary} lang={lang} /> : null}</div>
          </section>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4" aria-label="integrity">
            <h2 className="text-sm font-semibold text-sam-fg">{pickCommissionCopy(lang, "원장 무결성 검사 (DB)", "Ledger integrity (DB)")}</h2>
            {integrity?.checks ? (
              <ul className="mt-2 space-y-1 sam-text-helper">
                {Object.entries(integrity.checks).map(([k, c]) => (
                  <li key={k} className={c.violations === 0 ? "text-emerald-800" : "font-semibold text-red-700"}>
                    {c.violations === 0 ? "PASS" : `FAIL ${c.violations}`} · {CHECK_LABEL[k]?.[lang] ?? k}
                    {c.violations > 0 ? <span className="ml-1 sam-text-xxs font-normal">({c.ids.slice(0, 5).map((id) => id.slice(0, 8)).join(", ")})</span> : null}
                  </li>
                ))}
                {integrity.originalUnknown && integrity.originalUnknown.count > 0 ? (
                  <li className="text-amber-800">
                    NOT_PROVEN {integrity.originalUnknown.count} · {pickCommissionCopy(lang, "원부과액 증거 없는 레거시 행", "Legacy rows without original fee evidence")}
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 sam-text-helper text-sam-muted">{loading ? "…" : pickCommissionCopy(lang, "검사 결과 없음", "No result")}</p>
            )}
          </section>
        </>
      ) : null}

      {tab === "ledger" || tab === "review" || tab === "decided" ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          {selectedPosition ? (
            <div className="mb-3">
              <p className="mb-2 text-sm font-semibold text-sam-fg">{storeNames.get(selectedPosition.storeId) || storeId}</p>
              <StoreCashPositionCard position={selectedPosition} lang={lang} />
            </div>
          ) : null}
          {data?.summary ? <CommissionSummaryGrid summary={data.summary} lang={lang} /> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {tab === "ledger" ? (
              <CommissionFilterChips
                value={ledgerState}
                lang={lang}
                onChange={(s) => {
                  setOffset(0);
                  setLedgerState(s);
                }}
              />
            ) : null}
            <input
              className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
              value={orderNo}
              onChange={(e) => {
                setOffset(0);
                setOrderNo(e.target.value);
              }}
              placeholder={pickCommissionCopy(lang, "주문번호", "Order no.")}
            />
            <button type="button" className={Sam.btn.secondary} onClick={() => void load()} disabled={loading}>
              {loading ? pickCommissionCopy(lang, "불러오는 중…", "Loading…") : pickCommissionCopy(lang, "새로고침", "Refresh")}
            </button>
          </div>
          {rows.length === 0 && !loading ? (
            <p className="mt-4 sam-text-body text-sam-muted">{pickCommissionCopy(lang, "해당하는 수수료 내역이 없습니다.", "No commission rows.")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <li key={r.obligationId} className="rounded-ui-rect border border-sam-border-soft bg-sam-app/40 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-sam-fg">
                        <Link href={`/admin/stores/orders/${encodeURIComponent(r.orderId)}`} className="hover:underline">
                          #{r.orderNo}
                        </Link>{" "}
                        <span className="font-normal text-sam-muted">· {r.storeName || r.storeId.slice(0, 8)}</span>
                      </p>
                      <p className="sam-text-xxs text-sam-muted">
                        {pickCommissionCopy(lang, "주문 상태", "Order")}: {r.orderStatus || "—"}
                        {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
                        {r.adjustmentTrigger
                          ? ` · ${r.adjustmentTrigger === "cancelled" ? pickCommissionCopy(lang, "조리 후 취소", "cancelled after cooking") : pickCommissionCopy(lang, "환불", "refunded")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CommissionStateChip state={r.state} lang={lang} />
                      {r.state === "review_required" ? (
                        <button
                          type="button"
                          className={Sam.btn.primary}
                          disabled={busy}
                          onClick={() => {
                            setModalError(null);
                            setModal({ row: r, decision: null, amountPhp: "", reason: "", step: "form", idempotencyKey: newKey() });
                          }}
                        >
                          {pickCommissionCopy(lang, "수수료 결정", "Decide")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2">
                    <CommissionRowMoney row={r} lang={lang} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
        </section>
      ) : null}

      {tab === "cash" ? (
        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 space-y-3">
          <CashLedgerKindChips
            value={kinds}
            lang={lang}
            onChange={(k) => {
              setOffset(0);
              setKinds(k);
            }}
          />
          {cash ? <CashLedgerView page={cash} lang={lang} showStore={!storeId} /> : null}
          {cash ? (
            <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={cash.totalRows} loading={loading} onChange={setOffset} lang={lang} />
          ) : null}
        </section>
      ) : null}

      {gateModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-ui-rect bg-sam-surface p-4 shadow-lg">
            <h3 className="text-base font-semibold text-sam-fg">{pickCommissionCopy(lang, "주문 차단 정책 변경", "Change order-block policy")}</h3>
            <p className="mt-2 sam-text-helper text-sam-fg">{STORE_CASH_ORDER_GATE_LABEL[gateModal.mode][lang]}</p>
            {gateModal.mode === "block_when_not_positive" ? (
              <p className="mt-1 rounded-ui-rect bg-red-50 px-3 py-2 sam-text-helper text-red-800">
                {pickCommissionCopy(
                  lang,
                  `적용 즉시 순잔액 0 이하인 매장 ${wouldBlockCount}곳의 신규 주문이 차단됩니다. 이미 받은 주문은 영향 없습니다.`,
                  `${wouldBlockCount} store(s) with net <= 0 stop receiving new orders immediately. Existing orders are unaffected.`
                )}
              </p>
            ) : null}
            {gateModal.step === "form" ? (
              <textarea
                className="mt-3 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                rows={3}
                placeholder={pickCommissionCopy(lang, "변경 사유 (필수)", "Reason (required)")}
                value={gateModal.reason}
                onChange={(e) => setGateModal({ ...gateModal, reason: e.target.value })}
              />
            ) : (
              <p className="mt-3 sam-text-helper text-sam-muted">
                {pickCommissionCopy(lang, "사유", "Reason")}: {gateModal.reason}
              </p>
            )}
            {modalError ? <p className="mt-2 sam-text-helper text-red-700">{modalError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={Sam.btn.secondary} disabled={busy} onClick={() => setGateModal(null)}>
                {pickCommissionCopy(lang, "취소", "Cancel")}
              </button>
              {gateModal.step === "form" ? (
                <button
                  type="button"
                  className={Sam.btn.primary}
                  disabled={busy || gateModal.reason.trim().length < 2}
                  onClick={() => setGateModal({ ...gateModal, step: "confirm" })}
                >
                  {pickCommissionCopy(lang, "다음", "Next")}
                </button>
              ) : (
                <button type="button" className={Sam.btn.primary} disabled={busy} onClick={() => void submitGate()}>
                  {busy ? pickCommissionCopy(lang, "적용 중…", "Applying…") : pickCommissionCopy(lang, "확인 · 적용", "Confirm")}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-ui-rect bg-sam-surface p-4 shadow-lg">
            <h3 className="text-base font-semibold text-sam-fg">
              {pickCommissionCopy(lang, "취소·환불 주문 수수료 결정", "Commission on cancelled/refunded order")}
            </h3>
            <p className="mt-1 sam-text-helper text-sam-muted">
              #{modal.row.orderNo} · {modal.row.storeName} · {modal.row.orderStatus}
            </p>
            <div className="mt-3 rounded-ui-rect border border-sam-border-soft bg-sam-app p-3">
              <CommissionRowMoney row={modal.row} lang={lang} />
            </div>
            {modal.step === "form" ? (
              <>
                <fieldset className="mt-3 space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border-soft p-2">
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
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                      placeholder={pickCommissionCopy(
                        lang,
                        `승인 금액(₱) — 비우면 전액 ${formatCashMinor(modal.row.feePaidMinor + modal.row.feeOutstandingMinor)}`,
                        `Amount (₱) — empty = full ${formatCashMinor(modal.row.feePaidMinor + modal.row.feeOutstandingMinor)}`
                      )}
                      value={modal.amountPhp}
                      onChange={(e) => setModal({ ...modal, amountPhp: e.target.value })}
                    />
                  ) : null}
                  <label className="flex cursor-pointer items-start gap-2 rounded-ui-rect border border-sam-border-soft p-2">
                    <input type="radio" name="decision" checked={modal.decision === "reject"} onChange={() => setModal({ ...modal, decision: "reject" })} />
                    <span className="sam-text-helper text-sam-fg">
                      <b>{pickCommissionCopy(lang, "환급 거절", "Reject refund")}</b>
                      <br />
                      {pickCommissionCopy(lang, "매장 귀책 취소 등. 차감액 유지, 미납이 있으면 계속 청구됩니다.", "e.g. store-fault cancel. Charge stays; unpaid remains owed.")}
                    </span>
                  </label>
                </fieldset>
                <textarea
                  className="mt-3 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm"
                  rows={3}
                  placeholder={pickCommissionCopy(lang, "처리 사유 (필수, 매장에도 표시됨)", "Reason (required, visible to the store)")}
                  value={modal.reason}
                  onChange={(e) => setModal({ ...modal, reason: e.target.value })}
                />
              </>
            ) : (
              <div className="mt-3 rounded-ui-rect border border-amber-300 bg-amber-50 p-3 sam-text-helper text-amber-950">
                <p className="font-semibold">{pickCommissionCopy(lang, "이 결정은 되돌릴 수 없습니다.", "This decision is final.")}</p>
                {modal.decision === "approve" && decisionPreview ? (
                  <p>
                    {pickCommissionCopy(lang, "미납 취소", "Unpaid cancelled")} {formatCashMinor(decisionPreview.outstandingCancelMinor)} ·{" "}
                    {pickCommissionCopy(lang, "캐시 환급", "Cash refund")} {formatCashMinor(decisionPreview.cashRefundMinor)}
                  </p>
                ) : (
                  <p>{pickCommissionCopy(lang, "환급 없음 — 금액 이동 없음", "No refund — no money moves")}</p>
                )}
                <p>
                  {pickCommissionCopy(lang, "사유", "Reason")}: {modal.reason}
                </p>
              </div>
            )}
            {modalError ? <p className="mt-2 sam-text-helper text-red-700">{modalError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={Sam.btn.secondary} disabled={busy} onClick={() => setModal(null)}>
                {pickCommissionCopy(lang, "닫기", "Close")}
              </button>
              {modal.step === "form" ? (
                <button type="button" className={Sam.btn.primary} disabled={busy || !decisionValid} onClick={() => setModal({ ...modal, step: "confirm" })}>
                  {pickCommissionCopy(lang, "다음", "Next")}
                </button>
              ) : (
                <button type="button" className={Sam.btn.primary} disabled={busy} onClick={() => void submitDecision()}>
                  {busy ? pickCommissionCopy(lang, "처리 중…", "Saving…") : pickCommissionCopy(lang, "확정", "Confirm")}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
