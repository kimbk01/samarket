"use client";

/**
 * 설정 변경 이력 — 서버 페이지 (`GET /api/admin/app-settings?part=change-logs`, R7).
 * 쪽·크기(20/50/100)는 주소에 보존, 「총 N건」 표시. 자체 이전/다음(30건 고정) 대체.
 */

import type { SettingChangeLog } from "@/lib/types/admin-settings";
import type { AppSettings } from "@/lib/types/admin-settings";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

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

interface SettingChangeLogListProps {
  /** 저장·초기화 후 다시 불러오기 신호 */
  refreshKey?: number;
}

export function SettingChangeLogList({ refreshKey = 0 }: SettingChangeLogListProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery();
  const page = useAdminServerPage<SettingChangeLog>(
    `/api/admin/app-settings?part=change-logs&${lq.apiQueryString}`,
    `${lq.refreshKey}#${refreshKey}`
  );
  const offset = (lq.query.page - 1) * lq.query.size;

  const getKeyLabel = (key: string): string => {
    const labelKey = KEY_LABEL_KEYS[key as keyof AppSettings];
    return labelKey ? t(labelKey) : key;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-sam-border-soft pb-3">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_settings_changelog_heading")}</h3>
      </div>
      <AdminServerListFrame
        ko={ko}
        state={page}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        onRetry={lq.refresh}
        emptyMessage={t("admin_settings_changelog_empty")}
      >
        {(logs) => (
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
                <td className="px-3 py-2.5 text-sam-muted">{offset + i + 1}</td>
                <td className="px-3 py-2.5 font-medium text-sam-fg">{getKeyLabel(log.key)}</td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-muted" title={log.oldValue}>
                  {log.oldValue}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg" title={log.newValue}>
                  {log.newValue}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">{log.adminNickname}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sam-muted">
                  {formatAdminManilaDateTime(log.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        )}
      </AdminServerListFrame>
    </div>
  );
}
