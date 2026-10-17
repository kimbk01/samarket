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
    period: "this_month",
    fromDay: "",
    toDay: "",
  });
  const [orderNo, setOrderNo] = useState("");
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
    setOffset(0);
  }, [linkOrderNo]);
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

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const base = `/api/me/stores/${encodeURIComponent(storeId)}/commission-ledger`;
      const common = { period: period.period, fromDay: period.fromDay, toDay: period.toDay };
      const listTab = tab === "ledger" || tab === "review";
      const ledgerQs = buildStoreCommissionLedgerSearch({
        ...common,
        state: tabLedgerState(tab, ledgerState, reviewFilter),
        orderNo: orderNo || null,
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
      if (res.status === 401) {
        setError(t("mypage_comp_login_required"));
        setData(null);
        return;
      }
      if (res.status === 403) {
        setError(t("store_owner_no_permission"));
        setData(null);
        return;
      }
      const json = (await res.json()) as LedgerResponse;
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("store_owner_err_load_list"));
        setData(null);
        return;
      }
      setData(json);
      if (cashRes) {
        const cj = (await cashRes.json()) as CashResponse;
        if (!cashRes.ok || !cj.ok) setError(cj.error ?? t("store_owner_err_load_list"));
        else setCash(cj);
      }
      if (payableRes) {
        const pj = (await payableRes.json()) as PayableResponse;
        if (!payableRes.ok || !pj.ok) setError(pj.error ?? t("store_owner_err_load_list"));
        else setPayable(pj);
      }
    } catch {
      setError(t("store_owner_err_network"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [group, kinds, ledgerState, offset, orderNo, payableAll, period, reviewFilter, storeId, t, tab]);

  useEffect(() => {
    void load();
  }, [load]);

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
      <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "캐시 · 수수료 현황", "Cash & commission")}>
        <p className="mb-2 inline-flex rounded-ui-rect border border-sam-border bg-sam-app px-2.5 py-1 text-[11px] font-semibold tracking-wide text-sam-muted">
          {pickCommissionCopy(lang, "조회 전용", "Read only")}
        </p>
        <p className="sam-text-body text-sam-muted">
          {pickCommissionCopy(
            lang,
            "주문 대금은 고객에게 직접 받습니다. 플랫폼 수수료는 주문이 조리 시작으로 바뀌는 순간 캐시에서 자동 차감되며, 캐시가 부족하면 미납으로 남아 순잔액이 마이너스가 됩니다. 조리 시작 전 취소는 수수료가 없고, 조리 시작 후 취소·환불된 주문의 수수료는 운영팀이 확인 후 환급 여부를 결정합니다.",
            "You collect payment from buyers directly. Commission is auto-charged from Cash when an order starts cooking; any shortfall stays unpaid and your net goes negative. No fee if cancelled before cooking; for orders cancelled/refunded after cooking starts, operations decides whether to refund the fee."
          )}
        </p>
        <div className="mt-3">{data?.position ? <StoreCashPositionCard position={data.position} lang={lang} /> : null}</div>
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
        onChange={(p) => {
          setOffset(0);
          setPeriod(p);
        }}
      />

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
          <div className="mt-3">{cash ? <CashLedgerView page={cash} lang={lang} showStore={false} /> : null}</div>
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
