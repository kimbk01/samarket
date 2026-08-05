"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppNoticeRow } from "@/lib/types/settings-db";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";

type AdminNotice = AppNoticeRow & {
  starts_at?: string | null;
  ends_at?: string | null;
  updated_at?: string;
};

export function AdminAppNoticesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/app-notices", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          notices?: AdminNotice[];
          table_missing?: boolean;
        };
        if (cancelled) return;
        if (json.table_missing) setTableMissing(true);
        if (res.ok && json.ok && Array.isArray(json.notices)) setItems(json.notices);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_app_notices_title")}</h1>
        <Link
          href="/admin/app/notices/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_app_add")}
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : tableMissing ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {t("admin_app_notices_empty")}
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {t("admin_app_notices_empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{n.title}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {n.is_active ? t("admin_app_status_visible") : t("admin_app_status_hidden")}
                </span>
                <p className="mt-1 text-xs text-sam-meta">{buildAppNoticeDetailPath(n.id)}</p>
              </div>
              <Link href={`/admin/app/notices/${n.id}/edit`} className="sam-text-body text-signature">
                {t("common_edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
