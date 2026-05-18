"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppNoticeRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminAppNoticesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AppNoticeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      (supabase as any)
        .from("app_notices")
        .select("id, title, body, is_active, created_at")
        .order("created_at", { ascending: false })
        .then(({ data, error }: { data: AppNoticeRow[] | null; error: unknown }) => {
          if (!error && Array.isArray(data)) setItems(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
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
