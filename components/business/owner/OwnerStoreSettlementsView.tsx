"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { ownerFinanceSectionHref } from "@/lib/finance/routes";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { buildOwnerSupportContext } from "@/lib/support/support-context";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type {
  BusinessCashLedgerKind,
  StoreCashPosition,
  StoreCommissionLedgerFilterState,
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
  customPeriodInputState,
  OWNER_MONEY_DEFAULT_PERIOD,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { STORE_CASH_CHARGE_OUTCOME_KINDS } from "@/lib/notifications/money-outcome-signal";
import {
  CashLedgerKindChips,
  CashLedgerView,
  COMMISSION_TAB_LABEL,
  CommissionBreakdownTable,
  CommissionFilterChips,
  CommissionPeriodFilter,
  CommissionReviewFilterChips,
  CommissionSummaryGrid,
  chipClass,
  LedgerPager,
  pickCommissionCopy,
  PlatformPayableSummaryGrid,
  PlatformPayableTable,
  StoreCashPositionCard,
  tabLedgerState,
  type CommissionBreakdownGroup,
  type CommissionLang,
  type CommissionReviewFilter,
  type CommissionTab,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import { CommissionLedgerTable, CommissionOrderDetailPanel } from "@/components/stores/commission/StoreCommissionLedgerTable";

const PAGE_SIZE = 100;
/** Same tabs as Admin minus the admin-only financial exceptions view. */
const OWNER_TABS: CommissionTab[] = ["ledger", "review", "cash", "payable"];
const OWNER_BREAKDOWN_GROUPS: readonly CommissionBreakdownGroup[] = ["day", "month"];

type LedgerResponse = {
  ok?: boolean;
  error?: string;
  position?: StoreCashPosition | null;
  rows?: StoreCommissionLedgerRow[];
  totalRows?: number;
  summary?: StoreCommissionLedgerSummary;
  breakdown?: { group: CommissionBreakdownGroup; rows: StoreCommissionBreakdownRow[] };
  payableSummary?: StorePlatformPayableSummary;
};

type CashResponse = StoreCashLedgerPage & { ok?: boolean; error?: string };
type PayableResponse = StorePlatformPayablePage & { ok?: boolean; error?: string };

/**
 * 매장 어드민 — 정산 (`/stores/owner/settlements?storeId=`). 조회 전용.
 * Admin `/admin/store-settlements` 와 같은 SQL 함수·표·상세 패널 → 숫자·상태·이력 일치.
 */
export function OwnerStoreSettlementsView() {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [tab, setTab] = useState<CommissionTab>("ledger");
  const [ledgerState, setLedgerState] = useState<StoreCommissionLedgerFilterState>("all");
  const [reviewFilter, setReviewFilter] = useState<CommissionReviewFilter>("review_required");
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: OWNER_MONEY_DEFAULT_PERIOD,
    fromDay: "",
    toDay: "",
  });
  /** 입력칸 값 — 조회는 입력이 멈춘 뒤 `orderNoQuery` 로 (글자마다 조회하던 문제 · 재감사 R5-a) */
  const [orderNo, setOrderNo] = useState("");
  const [orderNoQuery, setOrderNoQuery] = useState("");
  useEffect(() => {
    const v = orderNo.trim();
    const timer = setTimeout(() => setOrderNoQuery(v), v ? 400 : 0);
    return () => clearTimeout(timer);
  }, [orderNo]);
  const customState = period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";
  // Deep link (owner finance outstanding rows): ?order_no=…&open=<obligation id> → all periods, that order, detail open.
  const linkOrderNo = searchParams.get("order_no")?.trim() ?? "";
  const openParam = searchParams.get("open")?.trim() ?? "";
  const appliedLinkRef = useRef<string | null>(null);
  const openedFromLinkRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkOrderNo || appliedLinkRef.current === linkOrderNo) return;
    appliedLinkRef.current = linkOrderNo;
    setTab("ledger");
    setPeriod({ period: "all", fromDay: "", toDay: "" });
    setOrderNo(linkOrderNo);
    setOrderNoQuery(linkOrderNo);
    setOffset(0);
  }, [linkOrderNo]);
  // 바로가기 「전체 기간」은 그 주문 1건 찾기에만 — 다른 탭으로 가거나 주문번호를 지우면 이번 달로(칩과 실제 기간 일치 · P-5)
  useEffect(() => {
    if (period.period !== "all") return;
    if (tab !== "ledger" || !orderNoQuery) {
      setOffset(0);
      setPeriod({ period: OWNER_MONEY_DEFAULT_PERIOD, fromDay: "", toDay: "" });
    }
  }, [orderNoQuery, period.period, tab]);
  const [kinds, setKinds] = useState<BusinessCashLedgerKind[]>([]);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [cash, setCash] = useState<CashResponse | null>(null);
  const [payable, setPayable] = useState<PayableResponse | null>(null);
  const [payableAll, setPayableAll] = useState(false);
  const [group, setGroup] = useState<CommissionBreakdownGroup>("day");
  const [selected, setSelected] = useState<StoreCommissionLedgerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 늦게 온 이전 응답이 새 기간·쪽·주문번호 결과를 덮지 않게 (재감사 R5-a) */
  const loadSeq = useRef(0);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current;
    if (!storeId) {
      setLoading(false);
      return;
    }
    if (customState !== "ok") {
      // 「직접」 날짜가 다 정해지기 전에는 조회하지 않는다 — 이전: 날짜 없이 조회해 전체 누적이 나옴 (R4-a)
      setData(null);
      setCash(null);
      setPayable(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const base = `/api/me/stores/${encodeURIComponent(storeId)}/commission-ledger`;
      const common = { period: period.period, fromDay: period.fromDay, toDay: period.toDay };
      const listTab = tab === "ledger" || tab === "review";
      const ledgerQs = buildStoreCommissionLedgerSearch({
        ...common,
        state: tabLedgerState(tab, ledgerState, reviewFilter),
        orderNo: orderNoQuery || null,
        group,
        limit: listTab ? PAGE_SIZE : 1,
        offset: listTab ? offset : 0,
      });
      const pagedQs = buildStoreCommissionLedgerSearch({ ...common, limit: PAGE_SIZE, offset });
      const [res, cashRes, payableRes] = await Promise.all([
        fetch(`${base}?${ledgerQs}`, { credentials: "include" }),
        tab === "cash"
          ? fetch(`${base}/cash-ledger?${buildStoreCommissionLedgerSearch({ ...common, kinds, limit: PAGE_SIZE, offset })}`, {
              credentials: "include",
            })
          : Promise.resolve(null),
        tab === "payable"
          ? fetch(`${base}/payable?${pagedQs}&view=${payableAll ? "all" : "payable"}`, { credentials: "include" })
          : Promise.resolve(null),
      ]);
      if (seq !== loadSeq.current) return;
      if (res.status === 401) {
        setError(t("mypage_comp_login_required"));
        setData(null);
        setCash(null);
        setPayable(null);
        return;
      }
      if (res.status === 403) {
        setError(t("store_owner_no_permission"));
        setData(null);
        setCash(null);
        setPayable(null);
        return;
      }
      const json = (await res.json()) as LedgerResponse;
      if (seq !== loadSeq.current) return;
      // 서버 오류 코드(json.error)는 화면에 쓰지 않는다 — 문구 하나로 (D-4)
      if (!res.ok || !json.ok) {
        setError(t("store_owner_err_load_list"));
        setData(null);
        if (cashRes) setCash(null);
        if (payableRes) setPayable(null);
        return;
      }
      setData(json);
      if (cashRes) {
        const cj = (await cashRes.json()) as CashResponse;
        if (seq !== loadSeq.current) return;
        // 실패하면 이 탭 표를 비운다 — 이전 기간·쪽 표가 남지 않게 (D-4)
        if (!cashRes.ok || !cj.ok) {
          setError(t("store_owner_err_load_list"));
          setCash(null);
        } else setCash(cj);
      }
      if (payableRes) {
        const pj = (await payableRes.json()) as PayableResponse;
        if (seq !== loadSeq.current) return;
        if (!payableRes.ok || !pj.ok) {
          setError(t("store_owner_err_load_list"));
          setPayable(null);
        } else setPayable(pj);
      }
    } catch {
      if (seq !== loadSeq.current) return;
      setError(t("store_owner_err_network"));
      setData(null);
      setCash(null);
      setPayable(null);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [customState, group, kinds, ledgerState, offset, orderNoQuery, payableAll, period, reviewFilter, storeId, t, tab]);

  useEffect(() => {
    void load();
  }, [load]);
  // 앱 복귀·이 매장의 처리 결과 알림(Cash 충전·Coin 출금) → 조용히 다시 읽기 (재감사 R1 · 이전: 재조회 없음)
  const refetchSilently = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchSilently, { enableWindowFocusRefetch: true });
  // 수수료·캐시 내역·미납 = Cash 쪽만 (Coin 출금은 이 화면 값을 바꾸지 않는다)
  useRefetchOnNotificationArrival(refetchSilently, { storeId, kinds: STORE_CASH_CHARGE_OUTCOME_KINDS });

  useEffect(() => {
    if (!openParam || openedFromLinkRef.current === openParam) return;
    const hit = data?.rows?.find((r) => r.obligationId === openParam);
    if (hit) {
      openedFromLinkRef.current = openParam;
      setSelected(hit);
    }
  }, [data?.rows, openParam]);

  if (!storeId) {
    return (
      <div className={`mx-auto max-w-4xl ${OWNER_STORE_STACK_Y_CLASS}`}>
        <OwnerStoreAdminDashSection title={t("store_owner_settlement_guide_title")}>
          <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_pick_store_body")}</p>
          <Link href={OwnerRoutes.hub()} className="inline-flex font-medium text-signature underline">
            {t("store_owner_settlement_go_hub")}
          </Link>
        </OwnerStoreAdminDashSection>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const totalRows = data?.totalRows ?? 0;

  return (
    <div className={`mx-auto min-w-0 max-w-6xl ${OWNER_STORE_STACK_Y_CLASS}`} data-commission-owner="1">
      <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "수수료·캐시 내역", "Commission & Cash history")}>
        <p className="mb-2 inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sam-muted">
          {pickCommissionCopy(lang, "조회 전용", "Read only")}
        </p>
        <p className="sam-text-body text-sam-muted">
          {pickCommissionCopy(
            lang,
            "주문 대금은 고객에게 직접 받고, 플랫폼 수수료는 조리 시작 때 캐시에서 차감됩니다.",
            "You collect payment from buyers directly; commission is charged from Cash when cooking starts."
          )}
        </p>
        <div className="mt-3">{data?.position ? <StoreCashPositionCard position={data.position} lang={lang} showGatePolicy={false} /> : null}</div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={ownerFinanceSectionHref(storeId, "convert")}
            className={OwnerCta.primary}
            data-owner-cash-topup="1"
          >
            {pickCommissionCopy(lang, "캐시 충전", "Top up Cash")}
          </Link>
          <Link href={OwnerRoutes.orders(storeId)} className={OwnerCta.secondary} data-owner-orders-link="1">
            {t("store_owner_settlement_manage_orders")}
          </Link>
        </div>
      </OwnerStoreAdminDashSection>

      {error ? <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body text-sam-danger" role="alert">{error}</p> : null}

      <nav className="flex flex-wrap gap-1.5" aria-label="tabs">
        {OWNER_TABS.map((x) => (
          <button
            key={x}
            type="button"
            className={chipClass(tab === x)}
            aria-current={tab === x ? "page" : undefined}
            onClick={() => {
              setOffset(0);
              setSelected(null);
              setTab(x);
            }}
          >
            {COMMISSION_TAB_LABEL[x][lang]}
          </button>
        ))}
      </nav>

      <CommissionPeriodFilter
        period={period.period}
        fromDay={period.fromDay}
        toDay={period.toDay}
        lang={lang}
        periods={OWNER_MONEY_PERIODS}
        onChange={(p) => {
          setOffset(0);
          setPeriod(p);
        }}
      />
      {customState !== "ok" ? (
        <p className="sam-text-body text-sam-muted" role="status" data-owner-settlement-custom={customState}>
          {customState === "inverted"
            ? pickCommissionCopy(lang, "시작일이 종료일보다 늦습니다. 날짜를 다시 골라 주세요.", "Start date is after end date. Pick the dates again.")
            : pickCommissionCopy(lang, "시작일과 종료일을 모두 고르면 내역을 보여 드립니다.", "Pick both start and end dates to see the history.")}
        </p>
      ) : null}

      {tab === "payable" ? (
        <OwnerStoreAdminDashSection title={COMMISSION_TAB_LABEL.payable[lang]}>
          {data?.payableSummary ? <PlatformPayableSummaryGrid summary={data.payableSummary} lang={lang} /> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
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
          <div className="mt-3">{payable ? <PlatformPayableTable page={payable} lang={lang} showStore={false} /> : null}</div>
          {payable ? <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={payable.totalRows} loading={loading} onChange={setOffset} lang={lang} /> : null}
        </OwnerStoreAdminDashSection>
      ) : tab === "cash" ? (
        <OwnerStoreAdminDashSection title={COMMISSION_TAB_LABEL.cash[lang]}>
          <CashLedgerKindChips
            value={kinds}
            lang={lang}
            onChange={(k) => {
              setOffset(0);
              setKinds(k);
            }}
          />
          <div className="mt-3">{cash ? <CashLedgerView page={cash} lang={lang} showStore={false} audience="owner" /> : null}</div>
          {cash ? <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={cash.totalRows} loading={loading} onChange={setOffset} lang={lang} /> : null}
        </OwnerStoreAdminDashSection>
      ) : (
        <>
          <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "수수료 합계", "Commission totals")}>
            {data?.summary ? (
              <CommissionSummaryGrid summary={data.summary} lang={lang} />
            ) : (
              <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_loading")}</p>
            )}
            {tab === "ledger" && data?.breakdown ? (
              <div className="mt-3">
                <CommissionBreakdownTable rows={data.breakdown.rows} group={group} groups={OWNER_BREAKDOWN_GROUPS} onGroupChange={setGroup} lang={lang} />
              </div>
            ) : null}
          </OwnerStoreAdminDashSection>

          <OwnerStoreAdminDashSection title={COMMISSION_TAB_LABEL[tab][lang]}>
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
                placeholder={t("store_owner_settlement_filter_order_no")}
                aria-label="order no"
              />
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper font-medium text-sam-fg disabled:opacity-50"
              >
                {loading ? t("store_owner_settlement_refreshing") : t("store_owner_refresh")}
              </button>
            </div>

            <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
            {loading && !data ? (
              <p className="mt-3 sam-text-body text-sam-muted" data-state="loading">{t("store_owner_settlement_loading")}</p>
            ) : rows.length === 0 ? (
              <p className="mt-3 sam-text-body text-sam-muted" data-state="empty">{t("store_owner_settlement_empty")}</p>
            ) : (
              <div className="mt-3">
                <CommissionLedgerTable
                  rows={rows}
                  lang={lang}
                  showStore={false}
                  audience="owner"
                  onOpen={setSelected}
                  selectedObligationId={selected?.obligationId ?? null}
                />
              </div>
            )}
            <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
          </OwnerStoreAdminDashSection>
        </>
      )}

      {selected ? (
        <CommissionOrderDetailPanel
          row={selected}
          lang={lang}
          onClose={() => setSelected(null)}
          audience="owner"
          orderHref={buildStoreOrdersHref({ storeId: selected.storeId, orderId: selected.orderId })}
          footer={
            <div className="space-y-2">
              <p className="sam-text-xxs text-sam-muted">
                {selected.state === "review_required"
                  ? pickCommissionCopy(lang, "운영팀이 수수료 환급 여부를 검토 중입니다. 결정되면 이 화면에 사유와 금액이 표시됩니다.", "Operations is reviewing this fee. The decision and reason will appear here.")
                  : pickCommissionCopy(lang, "조회 전용 — 금액 정정은 운영팀 결정 기록으로만 이루어집니다.", "Read only — corrections only via an operations decision record.")}
              </p>
              <button
                type="button"
                className={`${OwnerCta.tertiary} ${OwnerCta.block}`}
                data-owner-fee-inquiry="1"
                onClick={() => {
                  const orderId = selected.orderId;
                  // close the detail panel first so the support sheet is never stacked under it
                  setSelected(null);
                  navigateToSupportCenter(
                    buildOwnerSupportContext({
                      enabled: true,
                      category: "SETTLEMENT",
                      sourceSurface: "owner_commission_order",
                      storeId,
                      referenceType: "STORE_ORDER",
                      referenceId: orderId,
                    })
                  );
                }}
              >
                {pickCommissionCopy(lang, "이 주문 수수료 문의·이의 제기", "Ask about / dispute this fee")}
              </button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}
