"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { getFavoriteAuditLog, type FavoriteAuditRow } from "@/lib/admin-favorites/getFavoriteAuditLog";
import Link from "next/link";
import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export default function AdminFavoritesPage() {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [logs, setLogs] = useState<FavoriteAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getFavoriteAuditLog(200);
    setLogs(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_favorites_page_title" />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_favorites_intro_1")}
        <code className="rounded bg-sam-surface-muted px-1">{MYPAGE_TRADE_FAVORITES_HREF}</code>
        {t("admin_favorites_intro_2")}
        <code className="rounded bg-sam-surface-muted px-1">GET /api/favorites/list</code>
        {t("admin_favorites_intro_3")}
        <code className="rounded bg-sam-surface-muted px-1">favorites</code>
        {t("admin_favorites_intro_4")}
        <code className="rounded bg-sam-surface-muted px-1">POST /api/favorites/toggle</code>
        {t("admin_favorites_intro_5")}
        <code className="rounded bg-sam-surface-muted px-1">favorite_audit_log</code>
        {t("admin_favorites_intro_6")}
        <code className="rounded bg-sam-surface-muted px-1">GET /api/admin/favorite-audit</code>
        {t("admin_favorites_intro_7")}
      </p>
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_favorites_empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full text-left sam-text-body-secondary">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 font-medium text-sam-fg">{t("admin_favorites_col_time")}</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">{t("admin_favorites_col_action")}</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">user_id</th>
                <th className="px-3 py-2.5 font-medium text-sam-fg">post_id</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row) => (
                <tr key={row.id} className="border-b border-sam-border-soft">
                  <td className="px-3 py-2 text-sam-muted">
                    {new Date(row.created_at).toLocaleString(dateLocale)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        row.action === "add"
                          ? "text-green-600 font-medium"
                          : "text-sam-muted"
                      }
                    >
                      {row.action === "add" ? t("admin_favorites_action_add") : t("admin_favorites_action_remove")}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono sam-text-helper text-sam-fg">
                    {row.user_id.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/products/${row.post_id}`}
                      className="font-mono sam-text-helper text-signature hover:underline"
                    >
                      {row.post_id.slice(0, 8)}…
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
