"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserModerationLog } from "@/lib/types/admin-user";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  normal: "admin_users_mod_status_normal",
  warned: "admin_users_mod_status_warned",
  suspended: "admin_users_mod_status_suspended",
  banned: "admin_users_mod_status_banned",
};

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  warn: "admin_users_mod_action_warn",
  suspend: "admin_users_mod_action_suspend",
  ban: "admin_users_mod_action_ban",
  restore: "admin_users_mod_action_restore",
  upgrade_premium: "admin_users_mod_action_premium_on",
  downgrade_premium: "admin_users_mod_action_premium_off",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

interface AdminUserModerationLogListProps {
  logs: UserModerationLog[];
}

export function AdminUserModerationLogList({ logs }: AdminUserModerationLogListProps) {
  const { t, language } = useI18n();
  const dateLocale = dateLocaleTag(language);

  if (logs.length === 0) {
    return (
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_users_moderation_log_empty")}</p>
    );
  }
  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return (
    <ul className="space-y-2">
      {sorted.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
        >
          <span className="text-sam-muted">
            {(STATUS_LABEL_KEYS[log.fromStatus] ? t(STATUS_LABEL_KEYS[log.fromStatus]) : log.fromStatus)} →{" "}
            {(STATUS_LABEL_KEYS[log.toStatus] ? t(STATUS_LABEL_KEYS[log.toStatus]) : log.toStatus)}
          </span>
          <span className="font-medium text-sam-fg">
            {ACTION_LABEL_KEYS[log.actionType] ? t(ACTION_LABEL_KEYS[log.actionType]) : log.actionType}
          </span>
          <span className="text-sam-muted">
            {new Date(log.createdAt).toLocaleString(dateLocale)}
          </span>
          <span className="text-sam-muted">· {log.adminNickname}</span>
          {log.note && (
            <span className="w-full text-sam-muted">{t("admin_users_memo_prefix")} {log.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
