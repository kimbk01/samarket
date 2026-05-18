"use client";

import { useMemo, useState } from "react";
import type { SettingChangeLog } from "@/lib/types/admin-settings";
import { getSettingChangeLogs } from "@/lib/admin-settings/mock-setting-change-logs";
import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

const PAGE_SIZE = 30;

const KEY_LABEL_KEYS: Partial<Record<keyof AppSettings, MessageKey>> = {
  siteName: "admin_settings_key_site_name",
  defaultCurrency: "admin_settings_key_default_currency",
  defaultLocale: "admin_settings_key_default_locale",
  alarmSoundDataUrl: "admin_settings_key_alarm_sound",
  speedDisplayLabel: "admin_settings_key_speed_display_label",
  productAutoExpireDays: "admin_settings_key_product_auto_expire",
  maxProductImages: "admin_settings_key_max_product_images",
  allowPriceOffer: "admin_settings_key_allow_price_offer",
  allowProductBoost: "admin_settings_key_allow_product_boost",
  boostCooldownHours: "admin_settings_key_boost_cooldown",
  chatEnabled: "admin_settings_key_chat_enabled",
  allowChatAfterSold: "admin_settings_key_allow_chat_after_sold",
  maxMessageLength: "admin_settings_key_max_message_length",
  reportEnabled: "admin_settings_key_report_enabled",
  maxReportsPerTarget: "admin_settings_key_max_reports_per_target",
  trustReviewEnabled: "admin_settings_key_trust_review_enabled",
  mannerScoreVisible: "admin_settings_key_manner_score_visible",
  regionMultiSelectEnabled: "admin_settings_key_region_multi",
  maxSavedRegions: "admin_settings_key_max_saved_regions",
  homeRadiusKm: "admin_settings_key_home_radius_km",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface SettingChangeLogListProps {
  refreshKey?: number;
}

export function SettingChangeLogList({ refreshKey = 0 }: SettingChangeLogListProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [page, setPage] = useState(1);

  const result = useMemo(
    () => getSettingChangeLogs({ page, pageSize: PAGE_SIZE }),
    [page, refreshKey]
  );

  const { logs, total, totalPages, page: currentPage } = result as {
    logs: SettingChangeLog[];
    total: number;
    totalPages: number;
    page: number;
  };

  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, total);

  const getKeyLabel = (key: string): string => {
    const labelKey = KEY_LABEL_KEYS[key as keyof AppSettings];
    return labelKey ? t(labelKey) : key;
  };

  if (logs.length === 0 && total === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-app/50 py-10 text-center">
        <p className="sam-text-body text-sam-muted">{t("admin_settings_changelog_empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-sam-border-soft pb-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_settings_changelog_heading")}</h3>
        <p className="sam-text-body-secondary text-sam-muted">
          {t("admin_settings_changelog_pagination", {
            total,
            page: currentPage,
            totalPages,
          })}
        </p>
      </div>

      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[640px] text-left sam-text-body-secondary">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_no")}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_item")}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_old")}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_new")}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_admin")}
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 font-medium text-sam-fg">
                {t("admin_settings_changelog_th_date")}
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr
                key={log.id}
                className="border-b border-sam-border-soft last:border-0 hover:bg-sam-app/50"
              >
                <td className="px-3 py-2.5 text-sam-muted">{from + i}</td>
                <td className="px-3 py-2.5 font-medium text-sam-fg">{getKeyLabel(log.key)}</td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-muted" title={log.oldValue}>
                  {log.oldValue}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg" title={log.newValue}>
                  {log.newValue}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">{log.adminNickname}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {new Date(log.createdAt).toLocaleString(dateLocale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-sam-border-soft pt-3">
          <p className="sam-text-body-secondary text-sam-muted">
            {t("admin_settings_changelog_range", { from, to, total })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg disabled:opacity-40 hover:bg-sam-app"
            >
              {t("admin_settings_changelog_prev")}
            </button>
            <span className="px-2 sam-text-body-secondary text-sam-muted">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg disabled:opacity-40 hover:bg-sam-app"
            >
              {t("admin_settings_changelog_next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
