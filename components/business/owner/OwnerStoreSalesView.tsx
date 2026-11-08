"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import {
  CommissionPeriodFilter,
  pickCommissionCopy,
  type CommissionLang,
} from "@/components/stores/commission/StoreCommissionLedgerParts";
import { CurrencyAmount } from "@/components/currency/CurrencyAmount";
import {
  customPeriodInputState,
  OWNER_MONEY_DEFAULT_PERIOD,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  formatStoreSalesBucketLabel,
  storeSalesMonthDayRange,
  STORE_SALES_DAY_MAX_DAYS,
  type StoreSalesBucket,
  type StoreSalesGrain,
  type StoreSalesTotals,
} from "@/lib/stores/sales/store-sales-period";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { translateBy } from "@/lib/i18n/translate-by";

type SalesRow = StoreSalesBucket & { netCommissionMinor: number };
type SalesResponse = {
  ok?: boolean;
  error?: string;
  grain?: StoreSalesGrain;
  period?: { fromIso: string; toIso: string };
  totals?: StoreSalesTotals & { netCommissionMinor: number };
  rows?: SalesRow[];
};

const MANILA_OFFSET_MS = 8 * 3_600_000;
/** 기간 표시 `2026-11-01 ~ 2026-11-03 (PHT)` — 끝은 [from, to) 의 하루 전 */
function formatRangeLabel(fromIso: string, toIso: string): string {
  const d = (ms: number) => new Date(ms + MANILA_OFFSET_MS).toISOString().slice(0, 10);
  return `${d(Date.parse(fromIso))} ~ ${d(Date.parse(toIso) - 1)} (PHT)`;
}

/**
 * 사장님 「매출」 — 일별(고른 기간) / 월별(최근 12개월). 누적(전체) 없음.
 * 기준: 완료 시각 · 필리핀 시간 00:00 · 환불은 환불일 차감 · 수수료 = 정산 화면과 같은 함수(부과 시각).
 * (Owner 2026-11-03 · docs/audit/owner-e2e-round2-review-and-dashboard-design-2026-11-03.md §6)
 */
export function OwnerStoreSalesView() {
  const { t, language } = useI18n();
  const lang: CommissionLang = language === "ko" ? "ko" : "en";
  const searchParams = useOwnerAdminUrlSearchParams();
  const storeId = searchParams.get("storeId")?.trim() ?? "";

  const [grain, setGrain] = useState<StoreSalesGrain>("day");
  const [period, setPeriod] = useState<{ period: StoreCommissionPeriod; fromDay: string; toDay: string }>({
    period: OWNER_MONEY_DEFAULT_PERIOD,
    fromDay: "",
    toDay: "",
  });
  const [data, setData] = useState<SalesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 일별 「직접」 입력 상태 — 덜 고르거나 뒤바뀌면 조회하지 않고 안내 (D-12 · 이전: 이전 기간 값이 그대로 보였다) */
  const customState =
    grain === "day" && period.period === "custom" ? customPeriodInputState(period.fromDay, period.toDay) : "ok";

  const load = useCallback(async () => {
    if (!storeId) return;
    if (customState !== "ok") {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ grain });
      if (grain === "day") {
        qs.set("period", period.period);
        if (period.period === "custom") {
          qs.set("from", period.fromDay);
          qs.set("to", period.toDay);
        }
      }
      const res = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/sales?${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as SalesResponse;
      if (!res.ok || !j.ok) {
        setError(
          j.error === "sales_period_too_long"
            ? pickCommissionCopy(
                lang,
                `일별은 최대 ${STORE_SALES_DAY_MAX_DAYS}일까지 볼 수 있습니다. 기간을 줄이거나 월별로 보세요.`,
                `Daily view covers up to ${STORE_SALES_DAY_MAX_DAYS} days. Narrow the period or use monthly.`
              )
            : resolveOwnerApiErrorMessage(j.error, t)
        );
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setError(t("common_error"));
    } finally {
      setLoading(false);
    }
  }, [customState, grain, lang, period, storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = data?.totals;
  const rows = data?.rows ?? [];
  const tile = (label: string, value: ReactNode, sub: string) => (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-2.5">
      <p className="sam-text-xxs text-sam-muted">{label}</p>
      <p className="mt-0.5 text-[18px] font-bold tabular-nums text-sam-fg">{value}</p>
      <p className="mt-0.5 sam-text-xxs text-sam-muted">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-3 px-3 pb-6" data-owner-sales-view="1">
      <OwnerStoreAdminDashSection title={translateBy(lang, "business_sales", undefined, "en")}>
        <div className="space-y-3">
          <div
            className="grid grid-cols-2 overflow-hidden rounded-ui-rect border border-sam-border"
            role="tablist"
            aria-label={translateBy(lang, "business_view", undefined, "en")}
          >
            {(["day", "month"] as const).map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={grain === g}
                onClick={() => setGrain(g)}
                className={`min-h-11 sam-text-body font-semibold ${
                  grain === g ? "bg-signature text-sam-on-primary" : "bg-sam-surface text-sam-fg active:bg-sam-surface-muted"
                }`}
                data-owner-sales-grain={g}
              >
                {g === "day" ? translateBy(lang, "business_daily", undefined, "en") : translateBy(lang, "business_monthly", undefined, "en")}
              </button>
            ))}
          </div>

          {grain === "day" ? (
            <CommissionPeriodFilter
              period={period.period}
              fromDay={period.fromDay}
              toDay={period.toDay}
              lang={lang}
              periods={OWNER_MONEY_PERIODS}
              onChange={setPeriod}
            />
          ) : (
            <p className="sam-text-xxs text-sam-muted">
              {translateBy(lang, "business_last_12_months_philippine_time", undefined, "en")}
            </p>
          )}

          {customState !== "ok" ? (
            <p className="sam-text-body text-sam-muted" role="status" data-owner-sales-custom={customState}>
              {customState === "inverted"
                ? translateBy(lang, "business_start_date_is_after_end_date", undefined, "en")
                : translateBy(lang, "business_pick_both_start_and_end_dates_2", undefined, "en")}
            </p>
          ) : null}

          {data?.period ? (
            <p className="sam-text-xxs text-sam-muted" data-owner-sales-range="1">
              {formatRangeLabel(data.period.fromIso, data.period.toIso)}
            </p>
          ) : null}

          {error ? <p className="sam-text-body text-sam-danger">{error}</p> : null}
          {loading && !data ? <p className="sam-text-body text-sam-muted">{t("common_loading")}</p> : null}

          {totals ? (
            <div className="grid grid-cols-2 gap-2" data-owner-sales-totals="1">
              {tile(
                translateBy(lang, "business_completed_sales", undefined, "en"),
                formatMoneyPhp(totals.netSalesPhp),
                totals.refundedCount > 0
                  ? pickCommissionCopy(
                      lang,
                      `환불 ${totals.refundedCount}건 ${formatMoneyPhp(totals.refundedPhp)} 차감`,
                      `${totals.refundedCount} refunds ${formatMoneyPhp(totals.refundedPhp)} deducted`
                    )
                  : translateBy(lang, "business_by_completion_time", undefined, "en")
              )}
              {tile(
                translateBy(lang, "business_completed_orders", undefined, "en"),
                pickCommissionCopy(lang, `${totals.completedCount}건`, String(totals.completedCount)),
                pickCommissionCopy(lang, `들어온 주문 ${totals.createdCount}건`, `${totals.createdCount} received`)
              )}
              {tile(
                translateBy(lang, "business_average_order", undefined, "en"),
                formatMoneyPhp(totals.avgOrderValuePhp),
                pickCommissionCopy(lang, `매출 ÷ 완료 ${totals.completedCount}건`, `Sales ÷ ${totals.completedCount} completed`)
              )}
              {tile(
                translateBy(lang, "business_commission", undefined, "en"),
                <CurrencyAmount currency="cash" amount={totals.netCommissionMinor} isMinor />,
                translateBy(lang, "business_same_as_settlements", undefined, "en")
              )}
            </div>
          ) : null}

          {totals && rows.length === 0 && !loading ? (
            <p className="sam-text-body text-sam-muted">
              {translateBy(lang, "business_no_sales_in_this_period", undefined, "en")}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border" data-owner-sales-table={grain}>
              <table className="w-full min-w-[480px] sam-text-helper tabular-nums">
                <thead className="bg-sam-surface-muted text-left text-sam-muted">
                  <tr>
                    <th className="px-2 py-1.5">{pickCommissionCopy(lang, grain === "day" ? "날짜" : "월", grain === "day" ? "Date" : "Month")}</th>
                    <th className="px-2 py-1.5 text-right">{translateBy(lang, "business_done", undefined, "en")}</th>
                    <th className="px-2 py-1.5 text-right">{translateBy(lang, "business_sales", undefined, "en")}</th>
                    <th className="px-2 py-1.5 text-right">{translateBy(lang, "business_avg", undefined, "en")}</th>
                    <th className="px-2 py-1.5 text-right">{translateBy(lang, "business_cancel", undefined, "en")}</th>
                    <th className="px-2 py-1.5 text-right">{translateBy(lang, "business_fee", undefined, "en")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.bucket} className="border-t border-sam-border-soft" data-owner-sales-row={r.bucket}>
                      <td className="whitespace-nowrap px-2 py-2">
                        {grain === "day" ? (
                          /* 그날 완료 주문 목록 (완료 시각 기준 · 주문 목록 날짜 필터) */
                          <Link
                            href={buildStoreOrdersHref({ storeId, tab: "done", dateFrom: r.bucket, dateTo: r.bucket })}
                            className="inline-flex min-h-9 items-center font-semibold text-sam-primary underline"
                            data-owner-sales-row-orders={r.bucket}
                          >
                            {formatStoreSalesBucketLabel(r.bucket, grain, lang)}
                          </Link>
                        ) : (
                          /* 그 달 일별로 */
                          <button
                            type="button"
                            className="inline-flex min-h-9 items-center font-semibold text-sam-primary underline"
                            onClick={() => {
                              const range = storeSalesMonthDayRange(r.bucket);
                              setGrain("day");
                              setPeriod({ period: "custom", fromDay: range.fromDay, toDay: range.toDay });
                            }}
                            data-owner-sales-row-month={r.bucket}
                          >
                            {formatStoreSalesBucketLabel(r.bucket, grain, lang)}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{r.completedCount}</td>
                      <td className="px-2 py-2 text-right font-semibold">{formatMoneyPhp(r.netSalesPhp)}</td>
                      <td className="px-2 py-2 text-right">{formatMoneyPhp(r.avgOrderValuePhp)}</td>
                      <td className="px-2 py-2 text-right">{r.cancelledCount}</td>
                      <td className="px-2 py-2 text-right">
                        <CurrencyAmount currency="cash" amount={r.netCommissionMinor} isMinor />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="sam-text-xxs text-sam-muted">
            {translateBy(lang, "business_sales_completed_orders_by_completion_time", undefined, "en")}
          </p>
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
