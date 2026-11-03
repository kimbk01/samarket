"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { cancelRatePercent, salesDeltaPercent } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { buildOwnerOrdersEntryHref } from "@/lib/business/owner-orders-entry-policy";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import {
  deltaToneClass,
  formatDeltaPercent,
  formatMoneyPhp,
  ownerDashCardClass,
  ownerDashTypography,
} from "./owner-dashboard-ui";

/**
 * 홈 「오늘 매출」 — 오늘(PHT 00:00~)만, 누적 없음. 칸마다 이름 + 계산 기준 1줄.
 * 숫자 기준(DB `get_owner_store_ops_snapshot_counts`, 2026-11-03): 들어온 주문 = 생성 시각 · 매출 = 완료 시각(환불은 환불일 차감)
 * · 평균 주문 금액 = 매출 ÷ 완료 건수 · 취소율 = 오늘 들어온 주문 중 취소·환불 ÷ 들어온 주문 · 비교 = 어제 같은 시각까지.
 * 장식 그래프 없음(실제 시계열 아님 — 이전 `OwnerDashSparkline` 삭제). 오늘 주문이 없으면 한 줄만.
 */
export function OwnerSalesSummaryCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
  const { t } = useI18n();
  const completed = snapshot.flow_completed_today_count;
  const salesDelta = salesDeltaPercent(
    snapshot.today_completed_sales_amount,
    snapshot.yesterday_same_time_sales_amount
  );
  const cancelRate = cancelRatePercent(snapshot.today_cancelled_count, snapshot.today_order_count);
  const ordersHref = buildOwnerOrdersEntryHref({ storeId, freshList: true });
  const doneOrdersHref = buildOwnerOrdersEntryHref({ storeId, tab: "done", freshList: true });
  const cancelledOrdersHref = buildOwnerOrdersEntryHref({ storeId, tab: "cancelled", freshList: true });
  const settlementsHref = OwnerRoutes.settlements(storeId);
  const empty = snapshot.today_order_count === 0 && completed === 0 && snapshot.today_completed_sales_amount === 0;

  const tiles = [
    {
      id: "orders",
      label: t("store_owner_dash_today_order_count"),
      value: t("store_owner_dash_count_orders", { count: snapshot.today_order_count }),
      basis: t("store_owner_dash_today_order_hint"),
      delta: null as number | null,
      href: ordersHref,
    },
    {
      id: "sales",
      label: t("store_owner_dash_today_sales"),
      value: formatMoneyPhp(snapshot.today_completed_sales_amount),
      basis: null as string | null,
      delta: salesDelta,
      href: doneOrdersHref,
    },
    {
      id: "avg",
      label: t("store_owner_dash_avg_order_value"),
      value: formatMoneyPhp(snapshot.avg_order_value_today),
      basis: t("store_owner_dash_avg_basis", { count: completed }),
      delta: null as number | null,
      href: doneOrdersHref,
    },
    {
      id: "cancel",
      label: t("store_owner_dash_cancel_rate"),
      value: `${cancelRate}%`,
      basis: t("store_owner_dash_cancel_basis", {
        cancelled: snapshot.today_cancelled_count,
        total: snapshot.today_order_count,
      }),
      delta: null as number | null,
      href: cancelledOrdersHref,
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-sales-title" data-owner-home-today-sales="1">
      <OwnerDashSectionHeader
        id="owner-sales-title"
        title={t("store_owner_dash_today_summary")}
        href={settlementsHref}
        linkLabel={t("store_owner_dash_view_detail")}
      />
      {empty ? (
        <p className={`${ownerDashTypography.helper} text-[12px]`} data-owner-home-today-sales-empty="1">
          {t("store_owner_dash_no_sales_today")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => {
            const deltaLabel = formatDeltaPercent(tile.delta, t);
            return (
              <Link
                key={tile.id}
                href={tile.href}
                prefetch={false}
                data-owner-home-today-summary={tile.id}
                className="flex min-h-[80px] flex-col justify-between rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-2.5 active:bg-[var(--biz-tan-soft)]"
              >
                <p className={ownerDashTypography.cellTitle}>{tile.label}</p>
                <div>
                  <p className={ownerDashTypography.metric}>{tile.value}</p>
                  {deltaLabel ? (
                    <p className={`mt-0.5 ${ownerDashTypography.helper} ${deltaToneClass(tile.delta)}`}>{deltaLabel}</p>
                  ) : tile.basis ? (
                    <p className={`mt-0.5 ${ownerDashTypography.helper}`}>{tile.basis}</p>
                  ) : (
                    <p className={`mt-0.5 ${ownerDashTypography.helper}`}>{t("store_owner_dash_no_compare_yesterday")}</p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
