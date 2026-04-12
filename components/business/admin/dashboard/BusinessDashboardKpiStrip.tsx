"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getAppSettings } from "@/lib/admin-settings/mock-app-settings";
import { formatPrice } from "@/lib/utils/format";

export type DashboardKpi = {
  newOrders: number;
  inProgress: number;
  openInquiries: number;
  todaySalesPhp: number;
  settlementPendingPhp: number;
  soldOutProducts: number;
};

export function BusinessDashboardKpiStrip({
  kpi,
  ordersBaseHref,
  inquiriesHref,
  productsHubHref,
  settlementsHref,
}: {
  kpi: DashboardKpi;
  /** `/my/business/store-orders?storeId=…` 형태 */
  ordersBaseHref: string;
  inquiriesHref: string;
  productsHubHref: string;
  settlementsHref: string;
}) {
  const currency = useMemo(() => getAppSettings().defaultCurrency ?? "KRW", []);

  const withOrderTab = (tab: string) =>
    tab === "all" ? ordersBaseHref : `${ordersBaseHref}&tab=${encodeURIComponent(tab)}`;

  const cells = [
    {
      label: "신규 주문",
      value: String(kpi.newOrders),
      hint: "접수 대기",
      href: withOrderTab("new"),
    },
    {
      label: "진행 중",
      value: String(kpi.inProgress),
      hint: "처리 중",
      href: withOrderTab("progress"),
    },
    {
      label: "미응답 문의",
      value: String(kpi.openInquiries),
      hint: "답변 필요",
      href: inquiriesHref,
    },
    {
      label: "오늘 매출",
      value: formatPrice(Math.round(kpi.todaySalesPhp), currency),
      hint: "완료 기준",
      href: withOrderTab("done"),
    },
    {
      label: "정산 예정",
      value: formatPrice(Math.round(kpi.settlementPendingPhp), currency),
      hint: "플랫폼 정산",
      href: settlementsHref,
    },
    {
      label: "품절 상품",
      value: String(kpi.soldOutProducts),
      hint: "재고 확인",
      href: productsHubHref,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((c) => (
        <Link
          key={c.label}
          href={c.href}
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm transition hover:border-signature/30 hover:bg-signature/[0.03]"
        >
          <p className="text-[11px] font-medium text-sam-muted">{c.label}</p>
          <p className="mt-1 text-lg font-bold text-sam-fg">{c.value}</p>
          <p className="mt-0.5 text-[10px] text-sam-meta">{c.hint}</p>
        </Link>
      ))}
    </div>
  );
}
