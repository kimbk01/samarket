"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import type { StoreCashPosition, StoreCommissionRowState } from "@/lib/stores/commission/store-commission-contract";
import type {
  StoreCommissionLedgerRow,
  StoreCommissionLedgerSummary,
} from "@/lib/stores/commission/load-store-commission-ledger";
import { buildStoreCommissionLedgerSearch } from "@/lib/stores/commission/store-commission-ledger-query";
import {
  COMMISSION_STATE_FILTERS,
  CommissionRowMoney,
  CommissionStateChip,
  CommissionSummaryGrid,
  commissionFilterLabel,
  pickCommissionCopy,
  StoreCashPositionCard,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";

const PAGE_SIZE = 100;

type LedgerResponse = {
  ok?: boolean;
  error?: string;
  position?: StoreCashPosition | null;
  rows?: StoreCommissionLedgerRow[];
  totalRows?: number;
  summary?: StoreCommissionLedgerSummary;
  truncated?: boolean;
};

/**
 * 매장 어드민 — 정산 (`/stores/owner/settlements?storeId=`).
 * Admin `/admin/store-settlements` 와 같은 loader·summary·컴포넌트 → 숫자·상태 문구 일치.
 */
export function OwnerStoreSettlementsView() {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [state, setState] = useState<StoreCommissionRowState | "all">("all");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<LedgerResponse | null>(null);
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
      const qs = buildStoreCommissionLedgerSearch({
        state,
        from: fromDay || null,
        to: toDay || null,
        orderNo: orderNo || null,
        limit: PAGE_SIZE,
        offset,
      });
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/commission-ledger?${qs}`, {
        credentials: "include",
      });
      const json = (await res.json()) as LedgerResponse;
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
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("store_owner_err_load_list"));
        setData(null);
        return;
      }
      setData(json);
    } catch {
      setError(t("store_owner_err_network"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fromDay, offset, orderNo, state, storeId, t, toDay]);

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
        <p className="sam-text-body text-sam-muted">
          {pickCommissionCopy(
            lang,
            "주문 대금은 고객에게 직접 받습니다. 플랫폼 수수료는 주문이 조리 시작으로 바뀔 때 캐시에서 자동 차감되며, 캐시가 부족하면 미납으로 남아 순잔액이 마이너스가 됩니다. 조리 시작 후 취소·환불된 주문의 수수료는 운영팀이 확인 후 환급 여부를 결정합니다.",
            "You collect payment from buyers directly. Commission is auto-charged from Cash when an order starts cooking; any shortfall stays unpaid and your net goes negative. For orders cancelled/refunded after cooking starts, the operations team decides whether to refund the commission."
          )}
        </p>
        <div className="mt-3">
          {data?.position ? <StoreCashPositionCard position={data.position} lang={lang} /> : null}
        </div>
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

      {error ? (
        <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-800">{error}</p>
      ) : null}

      <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "수수료 합계", "Commission totals")}>
        {data?.summary ? (
          <CommissionSummaryGrid summary={data.summary} lang={lang} />
        ) : (
          <p className="sam-text-body text-sam-muted">{t("store_owner_settlement_loading")}</p>
        )}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "주문별 수수료", "Commission by order")}>
        <div className="flex flex-wrap gap-1.5">
          {COMMISSION_STATE_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setOffset(0);
                setState(s);
              }}
              className={
                state === s
                  ? "rounded-full bg-signature px-3 py-1.5 sam-text-xxs font-semibold text-white"
                  : "rounded-full border border-sam-border-soft bg-sam-app px-3 py-1.5 sam-text-xxs font-medium text-sam-fg hover:bg-sam-surface-muted"
              }
            >
              {commissionFilterLabel(s, lang)}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={fromDay}
            onChange={(e) => {
              setOffset(0);
              setFromDay(e.target.value);
            }}
            aria-label={t("store_owner_settlement_filter_from")}
          />
          <input
            type="date"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-helper"
            value={toDay}
            onChange={(e) => {
              setOffset(0);
              setToDay(e.target.value);
            }}
            aria-label={t("store_owner_settlement_filter_to")}
          />
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
                    <p className="text-sm font-semibold text-sam-fg">
                      {t("store_owner_settlement_row_order", { no: r.orderNo })}
                    </p>
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

        {totalRows > PAGE_SIZE ? (
          <div className="mt-3 flex items-center justify-between sam-text-helper">
            <button
              type="button"
              className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-50"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {pickCommissionCopy(lang, "이전", "Prev")}
            </button>
            <span className="text-sam-muted">
              {offset + 1}–{Math.min(offset + PAGE_SIZE, totalRows)} / {totalRows}
            </span>
            <button
              type="button"
              className="rounded-ui-rect border border-sam-border px-3 py-1.5 disabled:opacity-50"
              disabled={offset + PAGE_SIZE >= totalRows || loading}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {pickCommissionCopy(lang, "다음", "Next")}
            </button>
          </div>
        ) : null}
      </OwnerStoreAdminDashSection>
    </div>
  );
}
