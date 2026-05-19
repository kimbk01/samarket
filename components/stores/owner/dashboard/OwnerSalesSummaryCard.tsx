"use client";

import Link from "next/link";
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
  const salesDelta = salesDeltaPercent(
    snapshot.today_completed_sales_amount,
    snapshot.yesterday_completed_sales_amount
  );
  const cancelRate = cancelRatePercent(snapshot.today_cancelled_count, snapshot.today_order_count);
  const settlementsHref = OwnerRoutes.settlements(storeId);

  const tiles = [
    {
      label: "오늘 주문 수",
      value: `${snapshot.today_order_count}건`,
      delta: null as number | null,
    },
    {
      label: "오늘 매출",
      value: formatMoneyPhp(snapshot.today_completed_sales_amount),
      delta: salesDelta,
    },
    {
      label: "평균 주문금액",
      value: formatMoneyPhp(snapshot.avg_order_value_today),
      delta: null as number | null,
    },
    {
      label: "취소율",
      value: `${cancelRate}%`,
      delta: null as number | null,
    },
  ];

  return (
    <section className={ownerDashCardClass()} aria-labelledby="owner-sales-title">
      <OwnerDashSectionHeader
        id="owner-sales-title"
        title="오늘 운영 요약"
        href={settlementsHref}
        linkLabel="상세 보기"
      />
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => {
          const deltaLabel = formatDeltaPercent(t.delta);
          return (
            <Link
              key={t.label}
              href={settlementsHref}
              prefetch={false}
              className="flex min-h-[88px] flex-col justify-between rounded-[4px] border border-[#E5E7EB] bg-[#FAFAFA] p-2.5 active:bg-gray-100"
            >
              <div className="flex items-start justify-between gap-1">
                <p className={ownerDashTypography.cellTitle}>{t.label}</p>
                <OwnerDashSparkline />
              </div>
              <div>
                <p className={ownerDashTypography.metric}>{t.value}</p>
                {deltaLabel ? (
                  <p className={`mt-0.5 ${ownerDashTypography.helper} ${deltaToneClass(t.delta)}`}>
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
