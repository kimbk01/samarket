"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getAppSettings } from "@/lib/admin-settings/mock-app-settings";
import { formatPrice } from "@/lib/utils/format";

export type DashboardKpi = {
  newOrders: number;
  inProgress: number;
  refundRequested: number;
  openInquiries: number;
  todaySalesPhp: number;
  soldOutProducts: number;
};

export function BusinessDashboardKpiStrip({
  kpi,
  ordersBaseHref,
  inquiriesHref,
  productsHubHref,
  orderAlertsBadge = 0,
}: {
  kpi: DashboardKpi;
  ordersBaseHref: string;
  inquiriesHref: string;
  productsHubHref: string;
  orderAlertsBadge?: number;
}) {
  const currency = useMemo(() => getAppSettings().defaultCurrency ?? "KRW", []);

  const withOrderTab = (tab: string) =>
    tab === "all" ? ordersBaseHref : `${ordersBaseHref}&tab=${encodeURIComponent(tab)}`;

  const cells: Array<{
    key: string;
    label: string;
    value: string;
    sub: string;
    href: string;
    emphasize?: boolean;
  }> = [
    {
      key: "new",
      label: "신규 주문",
      value: String(kpi.newOrders),
      sub: "접수 대기",
      href: withOrderTab("new"),
      emphasize: orderAlertsBadge > 0,
    },
    {
      key: "progress",
      label: "진행 중",
      value: String(kpi.inProgress),
      sub: "배달·조리",
      href: withOrderTab("progress"),
    },
    {
      key: "refund",
      label: "환불 요청",
      value: String(kpi.refundRequested),
      sub: "처리 필요",
      href: withOrderTab("refund"),
      emphasize: kpi.refundRequested > 0,
    },
    {
      key: "inquiry",
      label: "미응답 문의",
      value: String(kpi.openInquiries),
      sub: "답변 필요",
      href: inquiriesHref,
      emphasize: kpi.openInquiries > 0,
    },
    {
      key: "sales",
      label: "오늘 매출",
      value: formatPrice(Math.round(kpi.todaySalesPhp), currency),
      sub: "완료 기준",
      href: withOrderTab("done"),
    },
    {
      key: "soldout",
      label: "품절",
      value: String(kpi.soldOutProducts),
      sub: "상품",
      href: productsHubHref,
      emphasize: kpi.soldOutProducts > 0,
    },
  ];

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-border p-px shadow-sm">
      <div className="grid grid-cols-2 gap-px sm:grid-cols-3 xl:grid-cols-6">
        {cells.map((c) => (
          <Link
            key={c.key}
            href={c.href}
            prefetch={false}
            className={`flex min-h-[5.25rem] flex-col justify-center bg-sam-surface px-2.5 py-2.5 transition sm:min-h-[5.75rem] sm:px-3 ${
              c.emphasize ? "ring-2 ring-inset ring-signature/35 hover:bg-signature/[0.06]" : "hover:bg-sam-app"
            }`}
          >
            <span className="sam-text-xxs font-semibold uppercase tracking-wide text-sam-meta">{c.label}</span>
            <span className="mt-1 tabular-nums text-xl font-bold leading-none tracking-tight text-sam-fg sm:text-2xl">
              {c.value}
            </span>
            <span className="mt-0.5 sam-text-xxs text-sam-muted">{c.sub}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
