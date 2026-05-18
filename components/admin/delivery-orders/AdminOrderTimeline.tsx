"use client";

import type { OrderStatusLog } from "@/lib/admin/delivery-orders-admin/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { doAdminLocale } from "./do-admin-locale";

export function AdminOrderTimeline({ logs }: { logs: OrderStatusLog[] }) {
  const { t, language } = useI18n();

  if (!logs.length) {
    return <p className="text-sm text-sam-muted">{t("admin_do_common_no_history")}</p>;
  }

  return (
    <ul className="space-y-3">
      {logs.map((l) => (
        <li key={l.id} className="border-l-2 border-sam-border pl-3 text-sm">
          <p className="text-sam-muted">{new Date(l.createdAt).toLocaleString(doAdminLocale(language))}</p>
          <p className="font-medium text-sam-fg">{l.action}</p>
          {l.fromOrderStatus || l.toOrderStatus ? (
            <p className="text-sam-fg">
              {t("admin_do_timeline_order", {
                from: l.fromOrderStatus ?? "—",
                to: l.toOrderStatus ?? "—",
              })}
            </p>
          ) : null}
          {l.reason ? (
            <p className="mt-1 rounded bg-sam-app px-2 py-1 text-xs text-sam-fg">
              {t("admin_do_common_reason_prefix", { reason: l.reason })}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
