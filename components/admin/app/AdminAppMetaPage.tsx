"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppMetaRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export function AdminAppMetaPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AppMetaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_meta').select('*').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <AdminPageHeader titleKey="admin_app_meta_title" />
      {loading ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">{t("admin_app_meta_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.key} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{m.key}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">{m.value}</span>
              </div>
              <Link href={`/admin/app/meta/${encodeURIComponent(m.key)}/edit`} className="sam-text-body text-signature">
                {t("common_edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
