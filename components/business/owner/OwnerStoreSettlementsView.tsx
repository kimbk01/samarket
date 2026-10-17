"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type {
  BusinessCashLedgerKind,
  StoreCashPosition,
  StoreCommissionLedgerFilterState,
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
  LedgerPager,
  pickCommissionCopy,
  StoreCashPositionCard,
  tabLedgerState,
  type CommissionLang,
  type CommissionTab,
} from "@/components/stores/commission/StoreCommissionLedgerParts";

const PAGE_SIZE = 100;
const OWNER_TABS: CommissionTab[] = ["ledger", "review", "decided", "cash"];

type LedgerResponse = {
  ok?: boolean;
  error?: string;
  position?: StoreCashPosition | null;
  rows?: StoreCommissionLedgerRow[];
  totalRows?: number;
  summary?: StoreCommissionLedgerSummary;
};

type CashResponse = StoreCashLedgerPage & { ok?: boolean; error?: string };

/**
 * 매장 어드민 — 정산 (`/stores/owner/settlements?storeId=`). 조회 전용.
 * Admin `/admin/store-settlements` 와 같은 SQL 함수·컴포넌트 → 숫자·상태 문구 일치.
 */
export function OwnerStoreSettlementsView() {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [tab, setTab] = useState<CommissionTab>("ledger");
  const [ledgerState, setLedgerState] = useState<StoreCommissionLedgerFilterState>("all");
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: "this_month",
    fromDay: "",
    toDay: "",
  });
  const [orderNo, setOrderNo] = useState("");
  const [kinds, setKinds] = useState<BusinessCashLedgerKind[]>([]);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [cash, setCash] = useState<CashResponse | null>(null);
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
      const ledgerQs = buildStoreCommissionLedgerSearch({
        ...common,
        state: tabLedgerState(tab, ledgerState),
        orderNo: orderNo || null,
        limit: PAGE_SIZE,
        offset: tab === "cash" ? 0 : offset,
      });
      const [res, cashRes] = await Promise.all([
        fetch(`${base}?${ledgerQs}`, { credentials: "include" }),
        tab === "cash"
          ? fetch(`${base}/cash-ledger?${buildStoreCommissionLedgerSearch({ ...common, kinds, limit: PAGE_SIZE, offset })}`, {
              credentials: "include",
            })
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
    } catch {
      setError(t("store_owner_err_network"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kinds, ledgerState, offset, orderNo, period, storeId, t, tab]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className={`mx-auto max-w-4xl min-w-0 ${OWNER_STORE_STACK_Y_CLASS}`}>
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
          <Link href={OwnerRoutes.finance(storeId)} className="rounded-ui-rect bg-signature px-3 py-2 sam-text-helper font-semibold text-white">
            {pickCommissionCopy(lang, "캐시 충전", "Top up Cash")}
          </Link>
          <Link
            href={OwnerRoutes.orders(storeId)}
            className="rounded-ui-rect border border-signature/40 bg-signature/5 px-3 py-2 sam-text-helper font-medium text-signature"
          >
            {t("store_owner_settlement_manage_orders")}
          </Link>
        </div>
      </OwnerStoreAdminDashSection>

      {error ? <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-800">{error}</p> : null}

      <nav className="flex flex-wrap gap-1.5" aria-label="tabs">
        {OWNER_TABS.map((x) => (
          <button
            key={x}
            type="button"
            className={chipClass(tab === x)}
            onClick={() => {
              setOffset(0);
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

      {tab === "cash" ? (
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
              ) : null}
              <input
                className="min-w-[10rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
                value={orderNo}
                onChange={(e) => {
                  setOffset(0);
                  setOrderNo(e.target.value);
                }}
                placeholder={t("store_owner_settlement_filter_order_no")}
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

            {loading && !data ? (
              <p className="mt-3 sam-text-body text-sam-muted">{t("store_owner_settlement_loading")}</p>
            ) : rows.length === 0 ? (
              <p className="mt-3 sam-text-body text-sam-muted">{t("store_owner_settlement_empty")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rows.map((r) => (
                  <li key={r.obligationId} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-sam-fg">{t("store_owner_settlement_row_order", { no: r.orderNo })}</p>
                        <p className="mt-0.5 sam-text-xxs text-sam-muted">
                          {r.orderStatus}
                          {r.paymentMethod ? ` · ${r.paymentMethod}` : ""}
                        </p>
                      </div>
                      <CommissionStateChip state={r.state} lang={lang} />
                    </div>
                    <div className="mt-2">
                      <CommissionRowMoney row={r} lang={lang} />
                    </div>
                    <Link
                      href={buildStoreOrdersHref({ storeId: r.storeId, orderId: r.orderId })}
                      className="mt-2 inline-block sam-text-helper font-medium text-signature underline-offset-2 hover:underline"
                    >
                      {t("store_owner_settlement_view_order")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <LedgerPager offset={offset} pageSize={PAGE_SIZE} total={totalRows} loading={loading} onChange={setOffset} lang={lang} />
          </OwnerStoreAdminDashSection>
        </>
      )}
    </div>
  );
}
