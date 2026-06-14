"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AppLanguageCode } from "@/lib/i18n/config";

type ModerationEventRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  reason: string;
  created_at: string;
};

const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  normal: "admin_users_mod_status_normal",
  warned: "admin_users_mod_status_warned",
  suspended: "admin_users_mod_status_suspended",
  banned: "admin_users_mod_status_banned",
  verified_user: "admin_users_mod_status_normal",
  deleted: "admin_users_mod_status_banned",
  purged: "admin_users_mod_status_banned",
};

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  warn: "admin_users_mod_action_warn",
  suspend: "admin_users_mod_action_suspend",
  ban: "admin_users_mod_action_ban",
  restore: "admin_users_mod_action_restore",
  soft_delete: "admin_users_mod_action_soft_delete",
  hard_delete: "admin_users_mod_action_hard_delete",
  purge: "admin_users_mod_action_purge",
};

function dateLocaleTag(language: AppLanguageCode): string {
  return language === "en" ? "en-US" : "ko-KR";
}

export function AdminUserModerationEventsList({
  userId,
  refreshKey = 0,
}: {
  userId: string;
  refreshKey?: number;
}) {
  const { t, language, safeT } = useI18n();
  const dateLocale = dateLocaleTag(language);
  const [events, setEvents] = useState<ModerationEventRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setEvents([]);
          return;
        }
        const data = (await res.json()) as { events?: ModerationEventRow[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (loading) {
    return (
      <p className="text-[13px] text-[#6F4E37]">
        {safeT("admin_users_detail_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
      </p>
    );
  }

  if (events.length === 0) {
    return <p className="text-[13px] text-[#6F4E37]">{t("admin_users_moderation_log_empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {events.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 border-b border-[#D4E9E2]/80 pb-2 text-[13px]"
        >
          <span className="text-[#6F4E37]">
            {(log.from_status && STATUS_LABEL_KEYS[log.from_status]
              ? t(STATUS_LABEL_KEYS[log.from_status])
              : log.from_status) ?? "—"}{" "}
            →{" "}
            {(log.to_status && STATUS_LABEL_KEYS[log.to_status]
              ? t(STATUS_LABEL_KEYS[log.to_status])
              : log.to_status) ?? "—"}
          </span>
          <span className="font-semibold text-[#1E3932]">
            {ACTION_LABEL_KEYS[log.action] ? t(ACTION_LABEL_KEYS[log.action]) : log.action}
          </span>
          <span className="text-[#6F4E37]">{new Date(log.created_at).toLocaleString(dateLocale)}</span>
          {log.reason ? (
            <span className="w-full text-[#6F4E37]">
              {t("admin_users_memo_prefix")} {log.reason}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
