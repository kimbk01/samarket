"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AppSupportedLanguageRow } from "@/lib/types/settings-db";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminAppLanguagesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<AppSupportedLanguageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_supported_languages').select('*').order('sort_order').then(({ data }) => setItems(data ?? []))
    }
    setLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{t("admin_app_languages_title")}</h1>
        <Link
          href="/admin/app/languages/create"
          className="rounded-ui-rect bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_app_add")}
        </Link>
      </div>
      {loading ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : items.length === 0 ? (
        <p className="rounded-ui-rect bg-sam-surface p-4 sam-text-body text-sam-muted">
          {t("admin_app_languages_empty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((l) => (
            <li key={l.code} className="flex items-center justify-between rounded-ui-rect bg-sam-surface p-3">
              <div>
                <span className="font-medium">{l.name}</span>
                <span className="ml-2 sam-text-body-secondary text-sam-muted">
                  {t("admin_app_list_meta", {
                    code: l.code,
                    status: l.is_active ? t("admin_app_status_visible") : t("admin_app_status_hidden"),
                    sort: t("admin_app_sort_order", { order: l.sort_order }),
                  })}
                </span>
              </div>
              <Link href={`/admin/app/languages/${l.code}/edit`} className="sam-text-body text-signature">
                {t("common_edit")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
