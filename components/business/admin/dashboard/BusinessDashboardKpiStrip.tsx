"use client";

import Link from "next/link";
import { formatMoneyPhp } from "@/lib/utils/format";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

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
  const { t } = useI18n();
  const withOrderTab = (tab: string) =>
    tab === "all" ? ordersBaseHref : `${ordersBaseHref}&tab=${encodeURIComponent(tab)}`;

  const cells: Array<{
    key: string;
    labelKey: MessageKey;
    value: string;
    subKey: MessageKey;
    href: string;
    emphasize?: boolean;
  }> = [
    {
      key: "new",
      labelKey: "business_phase7_175",
      value: String(kpi.newOrders),
      subKey: "business_phase7_596",
      href: withOrderTab("new"),
      emphasize: orderAlertsBadge > 0,
    },
    {
      key: "progress",
      labelKey: "store_in_progress",
      value: String(kpi.inProgress),
      subKey: "business_phase7_597",
      href: withOrderTab("progress"),
    },
    {
      key: "refund",
      labelKey: "store_biz_refund_badge",
      value: String(kpi.refundRequested),
      subKey: "business_phase7_598",
      href: withOrderTab("progress"),
      emphasize: kpi.refundRequested > 0,
    },
    {
      key: "inquiry",
      labelKey: "business_phase7_599",
      value: String(kpi.openInquiries),
      subKey: "business_phase7_600",
      href: inquiriesHref,
      emphasize: kpi.openInquiries > 0,
    },
    {
      key: "sales",
      labelKey: "business_phase7_214",
      value: formatMoneyPhp(Math.round(kpi.todaySalesPhp)),
      subKey: "business_phase7_601",
      href: withOrderTab("done"),
    },
    {
      key: "soldout",
      labelKey: "business_phase7_317",
      value: String(kpi.soldOutProducts),
      subKey: "business_phase7_602",
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
            <span className="sam-text-xxs font-semibold uppercase tracking-wide text-sam-meta">{t(c.labelKey)}</span>
            <span className="mt-1 tabular-nums text-xl font-bold leading-none tracking-tight text-sam-fg sm:text-2xl">
              {c.value}
            </span>
            <span className="mt-0.5 sam-text-xxs text-sam-muted">{t(c.subKey)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
