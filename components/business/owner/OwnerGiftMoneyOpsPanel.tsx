"use client";

import Link from "next/link";
import { readBalanceOrNull } from "@/lib/currency/currency-display-contract";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { STORE_COIN_WITHDRAWAL_OUTCOME_KINDS } from "@/lib/notifications/money-outcome-signal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyBalanceCard } from "@/components/currency";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_ADMIN_LIST_CARD_CLASS,
  OWNER_ADMIN_OUTLINE_BTN_CLASS,
  OWNER_ADMIN_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-list-ui";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import {
  OWNER_GIFT_REDEMPTIONS_PAGE_SIZE,
  ownerRedemptionStatusLabelKey,
  type OwnerGiftRedemptionFilter,
  type OwnerGiftRedemptionPeriodSummary,
  type OwnerGiftRedemptionRow,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import {
  computeOwnerEconomicReportingSum,
  type GiftPromoDisplayFields,
} from "@/lib/gift-certificate/gift-promo-economics";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  CommissionPeriodFilter,
  LedgerPager,
  pickCommissionCopy,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import {
  customPeriodInputState,
  formatManilaDateTime,
  OWNER_MONEY_DEFAULT_PERIOD,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";

type MoneyView = "money" | "history" | "redemptions";

const EMPTY_PROMO: GiftPromoDisplayFields = {
  contracted: 0,
  recognized: 0,
  unrecognized: 0,
  settled: 0,
  outstanding: 0,
};

/** 사용 내역 응답 (서버 쪽 나눔 · 합계 = 고른 기간 전체 · C-6) */
type RedemptionsPayload = {
  summary: OwnerGiftRedemptionPeriodSummary;
  rows: OwnerGiftRedemptionRow[];
  total: number;
  giftRail: { availablePhp: number; paidOutPhp: number } | null;
};

export function OwnerGiftMoneyOpsPanel(props: {
  storeId: string;
  view: MoneyView;
  onGo: (view: MoneyView) => void;
  onBackHome: () => void;
}) {
  const { storeId, view, onGo, onBackHome } = props;
  const { safeT, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [ownerPromo, setOwnerPromo] = useState<GiftPromoDisplayFields>(EMPTY_PROMO);
  const [redemptionFilter, setRedemptionFilter] = useState<OwnerGiftRedemptionFilter>("all");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [data, setData] = useState<RedemptionsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  /** 기간 = 사용 시각 · 사장님 기간 칩(「전체」 없음, 기본 이번 달 · Owner 2026-11-03 §6-3) */
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: OWNER_MONEY_DEFAULT_PERIOD,
    fromDay: "",
    toDay: "",
  });
  /** 매장이 바뀌면 앞 매장 값·쪽을 버린다 (렌더 중 상태 맞춤) */
  const [dataStoreId, setDataStoreId] = useState(storeId);
  if (dataStoreId !== storeId) {
    setDataStoreId(storeId);
    setData(null);
    setOffset(0);
    setExpandedId(null);
    setCoinBalance(null);
    setOwnerPromo(EMPTY_PROMO);
  }
  /** 늦게 온 이전 응답(앞 매장·기간·상태·쪽)이 새 결과를 덮지 않게 */
  const requestSeq = useRef(0);
  const customState = period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";

  const financeHref = OwnerRoutes.finance(storeId);

  const periodBar = (
    <div className="space-y-1" data-owner-gift-period="1">
      <CommissionPeriodFilter
        period={period.period}
        fromDay={period.fromDay}
        toDay={period.toDay}
        lang={lang}
        periods={OWNER_MONEY_PERIODS}
        onChange={(next) => {
          setOffset(0);
          setExpandedId(null);
          setPeriod(next);
        }}
      />
      {customState !== "ok" ? (
        <p className="text-sm text-sam-muted" role="status" data-owner-gift-custom={customState}>
          {customState === "inverted"
            ? pickCommissionCopy(lang, "시작일이 종료일보다 늦습니다. 날짜를 다시 골라 주세요.", "Start date is after end date. Pick the dates again.")
            : pickCommissionCopy(lang, "시작일과 종료일을 모두 고르면 내역을 보여 드립니다.", "Pick both start and end dates to see the history.")}
        </p>
      ) : null}
    </div>
  );

  /** 수익 요약 화면은 합계만 필요 — 목록 줄은 받지 않는다 (limit=0) */
  const pageLimit = view === "redemptions" ? OWNER_GIFT_REDEMPTIONS_PAGE_SIZE : 0;

  const load = useCallback(
    async (silent?: boolean) => {
      const sid = storeId.trim();
      const seq = ++requestSeq.current;
      if (!sid) return;
      if (customState !== "ok") {
        // 날짜가 다 정해지기 전에는 조회하지 않고, 앞 기간 값도 보이지 않게
        setData(null);
        setError(false);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const qs = new URLSearchParams({
        period: period.period,
        status: redemptionFilter,
        offset: String(offset),
        limit: String(pageLimit),
      });
      if (period.period === "custom") {
        qs.set("from", period.fromDay);
        qs.set("to", period.toDay);
      }
      try {
        const [financeRes, redemptionsRes, promoRes] = await Promise.all([
          fetch(`/api/me/stores/${encodeURIComponent(sid)}/finance`, {
            credentials: "include",
            cache: "no-store",
          }).catch(() => null),
          fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/redemptions?${qs.toString()}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/me/stores/${encodeURIComponent(sid)}/gift-certificates/promo`, {
            credentials: "include",
            cache: "no-store",
          }).catch(() => null),
        ]);
        const finance = financeRes?.ok
          ? ((await financeRes.json().catch(() => null)) as { assets?: { storePoints?: { balance?: number } } } | null)
          : null;
        const redemptionJson = (await redemptionsRes.json().catch(() => null)) as {
          ok?: boolean;
          redemptions?: OwnerGiftRedemptionRow[];
          summary?: OwnerGiftRedemptionPeriodSummary;
          total?: number;
          giftRail?: { availablePhp?: number; paidOutPhp?: number } | null;
        } | null;
        const promoJson = promoRes?.ok
          ? ((await promoRes.json().catch(() => null)) as { ok?: boolean; ownerPromo?: GiftPromoDisplayFields } | null)
          : null;
        if (seq !== requestSeq.current) return;

        setCoinBalance(readBalanceOrNull(finance?.assets?.storePoints?.balance));
        setOwnerPromo(promoJson?.ok && promoJson.ownerPromo ? promoJson.ownerPromo : EMPTY_PROMO);
        if (!redemptionsRes.ok || !redemptionJson?.ok || !redemptionJson.summary) {
          // 조용한 재조회 실패 → 보던 값은 두고 오류 띠만. 서버 오류 코드는 화면에 쓰지 않는다.
          if (!silent) setData(null);
          setError(true);
          return;
        }
        const rail = redemptionJson.giftRail;
        setError(false);
        setData({
          summary: redemptionJson.summary,
          rows: redemptionJson.redemptions ?? [],
          total: Math.max(0, Math.trunc(Number(redemptionJson.total) || 0)),
          giftRail: rail
            ? {
                availablePhp: Math.max(0, Math.trunc(Number(rail.availablePhp) || 0)),
                paidOutPhp: Math.max(0, Math.trunc(Number(rail.paidOutPhp) || 0)),
              }
            : null,
        });
      } catch {
        if (seq !== requestSeq.current) return;
        if (!silent) setData(null);
        setError(true);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [customState, offset, pageLimit, period.fromDay, period.period, period.toDay, redemptionFilter, storeId]
  );

  useEffect(() => {
    void load();
  }, [load]);
  const refreshSilently = useCallback(() => load(true), [load]);
  // 재감사 R1 — Coin 잔액: 앱 복귀·이 매장의 처리 결과 알림(Coin 출금 반려·지급 등) 때 다시 읽는다 (이전: 재조회 없음)
  useRefetchOnPageShowRestore(refreshSilently, { enableWindowFocusRefetch: true });
  // 이 패널의 돈 값은 Coin 잔액뿐 → Coin 출금 결과만
  useRefetchOnNotificationArrival(refreshSilently, { storeId, kinds: STORE_COIN_WITHDRAWAL_OUTCOME_KINDS });

  const summary = data?.summary ?? null;
  const giftRail = data?.giftRail ?? null;
  const recognizedMerchantNet = summary?.recognizedMerchantNet ?? 0;
  const economicReportingNet = useMemo(
    () =>
      computeOwnerEconomicReportingSum({
        recognizedMerchantNet,
        ownerPromoRecognized: ownerPromo.recognized,
      }),
    [recognizedMerchantNet, ownerPromo.recognized]
  );
  const pageRows = data?.rows ?? [];

  const errorBand = error ? (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-danger/40 bg-sam-surface px-3 py-2"
      role="alert"
      data-owner-gift-load-error="1"
    >
      <p className="text-sm text-sam-danger">
        {data
          ? pickCommissionCopy(
              lang,
              "최신 내역을 불러오지 못했습니다. 아래는 앞서 불러온 내역입니다.",
              "Could not refresh. Showing the last loaded data."
            )
          : pickCommissionCopy(
              lang,
              "상품권 사용 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
              "Could not load gift redemptions. Please try again."
            )}
      </p>
      <button
        type="button"
        className={OWNER_ADMIN_OUTLINE_BTN_CLASS}
        disabled={loading}
        onClick={() => void load()}
        data-owner-gift-retry="1"
      >
        {pickCommissionCopy(lang, "다시 시도", "Retry")}
      </button>
    </div>
  ) : null;

  const tabs = (
    <div className="mb-3 grid min-w-0 grid-cols-3 gap-2" data-owner-gift-money-tabs="1">
      <button
        type="button"
        className={`min-h-[44px] rounded-ui-rect px-1.5 text-xs font-medium sm:text-sm ${
          view === "money" ? "bg-signature text-sam-on-primary" : "border border-sam-border bg-sam-surface"
        }`}
        onClick={() => onGo("money")}
      >
        {safeT("gift_owner_tab_summary")}
      </button>
      <Link
        href={`${financeHref}#coin-history`}
        className="flex min-h-[44px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-1.5 text-center text-xs font-medium sm:text-sm"
      >
        {safeT("gift_owner_tab_history")}
      </Link>
      <button
        type="button"
        className={`min-h-[44px] rounded-ui-rect px-1.5 text-xs font-medium sm:text-sm ${
          view === "redemptions"
            ? "bg-signature text-sam-on-primary"
            : "border border-sam-border bg-sam-surface"
        }`}
        onClick={() => onGo("redemptions")}
      >
        {safeT("gift_owner_tab_redemptions")}
      </button>
    </div>
  );

  if (view === "redemptions") {
    const filters: { id: OwnerGiftRedemptionFilter; key: MessageKey; ko: string; en: string }[] = [
      { id: "all", key: "gift_owner_redemption_filter_all", ko: "전체", en: "All" },
      { id: "pending", key: "gift_owner_redemption_filter_pending", ko: "확정 대기", en: "Pending" },
      {
        id: "recognized",
        key: "gift_owner_redemption_filter_recognized",
        ko: "확정",
        en: "Recognized",
      },
      { id: "refund", key: "gift_owner_redemption_filter_refund", ko: "환불", en: "Refund" },
    ];
    return (
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_redemptions_title")}
      >
        {tabs}
        {periodBar}
        <div className="mb-3 grid grid-cols-4 gap-1.5" data-owner-gift-redemption-filters="1">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`min-h-[40px] rounded-ui-rect px-1 text-xs font-medium ${
                redemptionFilter === filter.id
                  ? "bg-signature text-sam-on-primary"
                  : "border border-sam-border bg-sam-surface"
              }`}
              aria-pressed={redemptionFilter === filter.id}
              onClick={() => {
                setOffset(0);
                setExpandedId(null);
                setRedemptionFilter(filter.id);
              }}
            >
              {safeT(filter.key, { fallbackKo: filter.ko, fallbackEn: filter.en })}
              {summary ? <span className="ml-0.5 tabular-nums">({summary.counts[filter.id]})</span> : null}
            </button>
          ))}
        </div>
        {errorBand}
        {customState !== "ok" || (error && !data) ? null : loading && !data ? (
          <p className="text-sm text-sam-muted">{pickCommissionCopy(lang, "불러오는 중…", "Loading…")}</p>
        ) : (summary?.counts.all ?? 0) === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-sam-muted">
              {safeT("gift_u5_redemptions_empty")}
            </p>
            <button type="button" className={OWNER_ADMIN_PRIMARY_BTN_CLASS} onClick={onBackHome}>
              {safeT("gift_owner_cta_apply")}
            </button>
          </div>
        ) : pageRows.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {pickCommissionCopy(lang, "이 조건에 맞는 내역이 없습니다.", "No entries match this filter.")}
          </p>
        ) : (
          <ul className="space-y-2" data-owner-gift-redemption-list="1">
            {pageRows.map((row) => {
              const open = expandedId === row.id;
              const pending = !row.reversed && !row.recognized;
              const statusKey = ownerRedemptionStatusLabelKey(row);
              return (
                <li key={row.id} className={OWNER_ADMIN_LIST_CARD_CLASS} data-redemption-id={row.id}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId(open ? null : row.id)}
                  >
                    <p className="truncate text-sm font-semibold">{row.giftTitle || "Gift"}</p>
                    <p className="mt-1 text-xs text-sam-muted">
                      {row.customerLabel || "—"} ·{" "}
                      {row.createdAt ? `${formatManilaDateTime(row.createdAt)} PHT` : "—"}
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
                      <span>
                        {safeT("gift_u5_used")}:{" "}
                        <strong>{formatMoneyPhp(row.redeemedAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_fee")}:{" "}
                        <strong>{formatMoneyPhp(row.platformFeeAmount)}</strong>
                      </span>
                      <span>
                        {safeT("gift_u5_net")}
                        : <strong>{formatMoneyPhp(row.merchantNetAmount)}</strong>
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium">
                      {safeT(statusKey as MessageKey, {
                        fallbackKo: row.reversed ? "환불 / 역분개" : pending ? "수익 확정 대기" : "수익 확정",
                        fallbackEn: row.reversed ? "Refund / reversed" : pending ? "Revenue pending" : "Revenue recognized",
                      })}
                    </p>
                  </button>
                  {open ? (
                    <div className="mt-3 border-t border-sam-border pt-3 text-xs">
                       <p className="font-mono break-all" data-owner-gift-public-number="1">
                         {row.publicGiftNumber || row.instanceId}
                       </p>
                      <Link
                        href={`${OwnerRoutes.orders(storeId)}${OwnerRoutes.orders(storeId).includes("?") ? "&" : "?"}order_id=${encodeURIComponent(row.orderId)}`}
                        className={`${OWNER_ADMIN_OUTLINE_BTN_CLASS} mt-2 inline-flex`}
                      >
                        {safeT("gift_u5_cta_order")}
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {customState === "ok" && data ? (
          <LedgerPager
            offset={offset}
            pageSize={OWNER_GIFT_REDEMPTIONS_PAGE_SIZE}
            total={data.total}
            loading={loading}
            onChange={(next) => {
              setExpandedId(null);
              setOffset(next);
            }}
            lang={lang}
          />
        ) : null}
      </OwnerStoreAdminDashSection>
    );
  }

  return (
    <div className="space-y-4" data-owner-gift-money="coin-converged">
      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_money_title")}
      >
        {tabs}
        {periodBar}
        {errorBand}
        {customState !== "ok" || !summary ? (
          loading && customState === "ok" && !error ? (
            <p className="text-sm text-sam-muted">{pickCommissionCopy(lang, "불러오는 중…", "Loading…")}</p>
          ) : null
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-xs text-sam-muted">
                {safeT("gift_u5_kpi_merchant_net")}
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatMoneyPhp(summary.recognizedMerchantNet)}
              </p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
              <p className="text-xs text-sam-muted">
                {safeT("gift_u5_kpi_pending_merchant")}
              </p>
              <p className="mt-1 font-semibold tabular-nums">
                {formatMoneyPhp(summary.pendingMerchantNet)}
              </p>
            </div>
            {giftRail ? (
              <>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-rail="available">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_kpi_available")}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatMoneyPhp(giftRail.availablePhp)}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3" data-owner-gift-rail="paid-out">
                  <p className="text-xs text-sam-muted">
                    {safeT("gift_u5_rail_paid_out")}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{formatMoneyPhp(giftRail.paidOutPhp)}</p>
                </div>
              </>
            ) : null}
          </div>
        )}
        <p className="mt-3 text-xs text-sam-muted" data-owner-gift-rail-notice="1">
          {safeT("gift_u5_rail_notice")}
        </p>
      </OwnerStoreAdminDashSection>

      <CurrencyBalanceCard
        currency="coin"
        amount={coinBalance}
        actions={[
          { id: "withdraw", href: `${financeHref}#coin-withdraw`, primary: true },
          { id: "history", href: `${financeHref}#coin-history` },
        ]}
        footer={
          <p className="text-sm text-sam-muted">
            {safeT("gift_owner_action_cash_out_desc")}
          </p>
        }
      />

      <OwnerStoreAdminDashSection
        title={safeT("gift_u5_panel_economic_title")}
      >
        <p className="text-sm tabular-nums">
          {safeT("gift_u5_panel_economic_sum", { vars: {
              merchant: formatMoneyPhp(recognizedMerchantNet),
              promo: formatMoneyPhp(ownerPromo.recognized),
              net: formatMoneyPhp(economicReportingNet),
            } })}
        </p>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
