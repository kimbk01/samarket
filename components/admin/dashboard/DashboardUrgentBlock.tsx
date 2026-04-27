"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const URGENT_LINKS: { id: string; href: string; labelKey: MessageKey }[] = [
  { id: "reports-pending", href: "/admin/reports", labelKey: "admin_dashboard_urgent_reports_pending" },
  { id: "charges-pending", href: "/admin/point-charges", labelKey: "admin_dashboard_urgent_charge_pending" },
  { id: "blind-review", href: "/admin/reports", labelKey: "admin_dashboard_urgent_blind_review" },
  { id: "feed-incident", href: "/admin/feed-emergency", labelKey: "admin_dashboard_urgent_feed_incident" },
  { id: "system-warn", href: "/admin/system", labelKey: "admin_dashboard_urgent_system_warn" },
];

export function DashboardUrgentBlock() {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-amber-200 bg-amber-50/80 p-4">
      <h2 className="mb-3 sam-text-body-secondary font-medium text-amber-800">
        {t("admin_dashboard_urgent_title")}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {URGENT_LINKS.map(({ id, href, labelKey }) => (
          <li key={id}>
            <Link
              href={href}
              className="inline-block rounded border border-amber-300 bg-sam-surface px-3 py-1.5 sam-text-body-secondary text-amber-800 hover:bg-amber-100"
            >
              {t(labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
