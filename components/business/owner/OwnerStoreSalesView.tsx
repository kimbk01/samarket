"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  OWNER_MONEY_DEFAULT_PERIOD,
  OWNER_MONEY_PERIODS,
  type StoreCommissionPeriod,
} from "@/lib/stores/commission/store-commission-ledger-query";
import {
  formatStoreSalesBucketLabel,
  STORE_SALES_DAY_MAX_DAYS,
  type StoreSalesBucket,
  type StoreSalesGrain,
  type StoreSalesTotals,
} from "@/lib/stores/sales/store-sales-period";
import { formatMoneyPhp } from "@/lib/utils/format";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";

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

  const load = useCallback(async () => {
    if (!storeId) return;
    if (grain === "day" && period.period === "custom" && (!period.fromDay || !period.toDay)) return;
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
  }, [grain, lang, period, storeId, t]);

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
      <OwnerStoreAdminDashSection title={pickCommissionCopy(lang, "매출", "Sales")}>
        <div className="space-y-3">
          <div
            className="grid grid-cols-2 overflow-hidden rounded-ui-rect border border-sam-border"
            role="tablist"
            aria-label={pickCommissionCopy(lang, "보기 단위", "View")}
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
                {g === "day" ? pickCommissionCopy(lang, "일별", "Daily") : pickCommissionCopy(lang, "월별", "Monthly")}
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
              {pickCommissionCopy(lang, "최근 12개월 · 필리핀 시간 기준", "Last 12 months · Philippine time")}
            </p>
          )}

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
                pickCommissionCopy(lang, "완료 매출", "Completed sales"),
                formatMoneyPhp(totals.netSalesPhp),
                totals.refundedCount > 0
                  ? pickCommissionCopy(
                      lang,
                      `환불 ${totals.refundedCount}건 ${formatMoneyPhp(totals.refundedPhp)} 차감`,
                      `${totals.refundedCount} refunds ${formatMoneyPhp(totals.refundedPhp)} deducted`
                    )
                  : pickCommissionCopy(lang, "완료 시각 기준", "By completion time")
              )}
              {tile(
                pickCommissionCopy(lang, "완료 주문", "Completed orders"),
                pickCommissionCopy(lang, `${totals.completedCount}건`, String(totals.completedCount)),
                pickCommissionCopy(lang, `들어온 주문 ${totals.createdCount}건`, `${totals.createdCount} received`)
              )}
              {tile(
                pickCommissionCopy(lang, "평균 주문 금액", "Average order"),
                formatMoneyPhp(totals.avgOrderValuePhp),
                pickCommissionCopy(lang, `매출 ÷ 완료 ${totals.completedCount}건`, `Sales ÷ ${totals.completedCount} completed`)
              )}
              {tile(
                pickCommissionCopy(lang, "수수료", "Commission"),
                <CurrencyAmount currency="cash" amount={totals.netCommissionMinor} isMinor />,
                pickCommissionCopy(lang, "정산 화면과 같은 값", "Same as settlements")
              )}
            </div>
          ) : null}

          {totals && rows.length === 0 && !loading ? (
            <p className="sam-text-body text-sam-muted">
              {pickCommissionCopy(lang, "이 기간에 매출이 없습니다.", "No sales in this period.")}
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-ui-rect border border-sam-border" data-owner-sales-table={grain}>
              <table className="w-full min-w-[480px] sam-text-helper tabular-nums">
                <thead className="bg-sam-surface-muted text-left text-sam-muted">
                  <tr>
                    <th className="px-2 py-1.5">{pickCommissionCopy(lang, grain === "day" ? "날짜" : "월", grain === "day" ? "Date" : "Month")}</th>
                    <th className="px-2 py-1.5 text-right">{pickCommissionCopy(lang, "완료", "Done")}</th>
                    <th className="px-2 py-1.5 text-right">{pickCommissionCopy(lang, "매출", "Sales")}</th>
                    <th className="px-2 py-1.5 text-right">{pickCommissionCopy(lang, "평균", "Avg")}</th>
                    <th className="px-2 py-1.5 text-right">{pickCommissionCopy(lang, "취소", "Cancel")}</th>
                    <th className="px-2 py-1.5 text-right">{pickCommissionCopy(lang, "수수료", "Fee")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.bucket} className="border-t border-sam-border-soft" data-owner-sales-row={r.bucket}>
                      <td className="whitespace-nowrap px-2 py-2">{formatStoreSalesBucketLabel(r.bucket, grain, lang)}</td>
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
            {pickCommissionCopy(
              lang,
              "매출 = 완료된 주문 금액(완료 시각 기준, 환불은 환불한 날 차감) · 취소 = 그날 들어온 주문 중 취소·환불 · 수수료 = 부과 시각 기준",
              "Sales = completed orders by completion time (refunds deducted on refund day) · Cancel = orders received that day then cancelled/refunded · Fee = by charge time"
            )}
          </p>
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
