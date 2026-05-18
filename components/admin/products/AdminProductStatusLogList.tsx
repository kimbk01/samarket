"use client";

import type { ProductStatusLog } from "@/lib/types/product";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface AdminProductStatusLogListProps {
  logs: ProductStatusLog[];
}

export function AdminProductStatusLogList({ logs }: AdminProductStatusLogListProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_products_status_log_empty")}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap gap-x-3 gap-y-1 border-b border-sam-border-soft py-2 sam-text-body-secondary last:border-0"
        >
          <span className="text-sam-muted">{new Date(log.createdAt).toLocaleString()}</span>
          <span>
            {log.fromStatus} → {log.toStatus}
          </span>
          {log.note ? (
            <span className="w-full text-sam-muted">{t("admin_products_status_log_note", { note: log.note })}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
