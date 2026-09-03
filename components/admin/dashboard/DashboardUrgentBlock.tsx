"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type UrgentLink = {
  id: string;
  href: string;
  labelKey: MessageKey;
  countKey?: "cashCharges" | "userCharges";
};

const URGENT_LINKS: UrgentLink[] = [
  { id: "reports-pending", href: "/admin/reports", labelKey: "admin_dashboard_urgent_reports_pending" },
  {
    id: "cash-charges-pending",
    href: "/admin/delivery-ads/cash-charges",
    labelKey: "admin_dashboard_urgent_charge_pending",
    countKey: "cashCharges",
  },
  {
    id: "user-charges-pending",
    href: "/admin/point-charges",
    labelKey: "admin_dashboard_urgent_user_charge_pending",
    countKey: "userCharges",
  },
  { id: "blind-review", href: "/admin/reports", labelKey: "admin_dashboard_urgent_blind_review" },
  { id: "feed-incident", href: "/admin/feed-emergency", labelKey: "admin_dashboard_urgent_feed_incident" },
  { id: "system-warn", href: "/admin/system", labelKey: "admin_dashboard_urgent_system_warn" },
];

export function DashboardUrgentBlock() {
  const { t } = useI18n();
  const { cashChargePendingCount, userChargePendingCount } = useAdminStorePointPendingCount();

  const counts = {
    cashCharges: cashChargePendingCount,
    userCharges: userChargePendingCount,
  };

  return (
    <div className="rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4">
      <h2 className="mb-3 sam-text-body-secondary font-medium text-amber-800">
        {t("admin_dashboard_urgent_title")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {URGENT_LINKS.map(({ id, href, labelKey, countKey }) => {
          const count = countKey ? counts[countKey] : 0;
          return (
            <li key={id}>
              <Link
                href={href}
                className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-amber-800 hover:bg-amber-100"
              >
                {t(labelKey)}
                {count > 0 ? (
                  <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                    {count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
