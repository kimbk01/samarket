"use client";

import type { ModerationAction } from "@/lib/types/report";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { messageKeyForReportAction } from "@/lib/admin-reports/report-admin-i18n-keys";

interface AdminModerationLogListProps {
  actions: ModerationAction[];
}

function localeForLog(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

export function AdminModerationLogList({ actions }: AdminModerationLogListProps) {
  const { t, language } = useI18n();
  if (actions.length === 0) {
    return <p className="sam-text-body-secondary text-sam-muted">{t("admin_report_no_logs")}</p>;
  }
  return (
    <ul className="space-y-2">
      {actions
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .map((a) => {
          const mk = messageKeyForReportAction(a.actionType);
          const actionLabel = mk ? t(mk) : a.actionType;
          return (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary"
            >
              <span className="font-medium text-sam-fg">{actionLabel}</span>
              <span className="text-sam-muted">
                {new Date(a.createdAt).toLocaleString(localeForLog(language))}
              </span>
              <span className="text-sam-muted">· {a.adminNickname}</span>
              {a.note && (
                <span className="w-full text-sam-muted">
                  {t("admin_report_memo_with_note", { note: a.note })}
                </span>
              )}
            </li>
          );
        })}
    </ul>
  );
}
