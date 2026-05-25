"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OwnerStoreOpsSnapshot } from "@/lib/stores/owner-store-ops-snapshot";
import { cancelRatePercent, salesDeltaPercent } from "@/lib/stores/owner-store-ops-snapshot";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { OwnerDashSparkline } from "./OwnerDashSparkline";
import {
  deltaToneClass,
  formatDeltaPercent,
  formatMoneyPhp,
  ownerDashCardClass,
  ownerDashTypography,
} from "./owner-dashboard-ui";

export function OwnerSalesSummaryCard({
  storeId,
  snapshot,
}: {
  storeId: string;
  snapshot: OwnerStoreOpsSnapshot;
}) {
  const { t } = useI18n();
  const salesDelta = salesDeltaPercent(
    snapshot.today_completed_sales_amount,
    snapshot.yesterday_completed_sales_amount
  );
  const cancelRate = cancelRatePercent(snapshot.today_cancelled_count, snapshot.today_order_count);
  const settlementsHref = OwnerRoutes.settlements(storeId);

  const tiles = [
    {
      id: "orders",
      label: t("store_owner_dash_today_order_count"),
      value: t("store_owner_dash_count_orders", { count: snapshot.today_order_count }),
      delta: null as number | null,
    },
    {
      id: "sales",
      label: t("store_owner_dash_today_sales"),
      value: formatMoneyPhp(snapshot.today_completed_sales_amount),
      delta: salesDelta,
    },
    {
      id: "avg",
      label: t("store_owner_dash_avg_order_value"),
      value: formatMoneyPhp(snapshot.avg_order_value_today),
      delta: null as number | null,
    },
    {
      id: "cancel",
      label: t("store_owner_dash_cancel_rate"),
      value: `${cancelRate}%`,
      delta: null as number | null,
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-sales-title">
      <OwnerDashSectionHeader
        id="owner-sales-title"
        title={t("store_owner_dash_today_summary")}
        href={settlementsHref}
        linkLabel={t("store_owner_dash_view_detail")}
      />
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => {
          const deltaLabel = formatDeltaPercent(tile.delta, t);
          return (
            <Link
              key={tile.id}
              href={settlementsHref}
              prefetch={false}
              className="flex min-h-[88px] flex-col justify-between rounded-[4px] border border-[var(--biz-card-border)] bg-[var(--biz-tan-soft)] p-2.5 active:bg-[var(--biz-primary-soft)]"
            >
              <div className="flex items-start justify-between gap-1">
                <p className={ownerDashTypography.cellTitle}>{tile.label}</p>
                <OwnerDashSparkline />
              </div>
              <div>
                <p className={ownerDashTypography.metric}>{tile.value}</p>
                {deltaLabel ? (
                  <p className={`mt-0.5 ${ownerDashTypography.helper} ${deltaToneClass(tile.delta)}`}>
                    {deltaLabel}
                  </p>
                ) : (
                  <p className={`mt-0.5 ${ownerDashTypography.helper} text-gray-400`}>—</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
