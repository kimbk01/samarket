"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function AdminMeetingDetailPanel({ meetingId }: { meetingId: string | null }) {
  const { t } = useI18n();
  if (!meetingId) return null;
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body-secondary text-sam-fg">
      {t("admin_meeting_detail_panel", { id: meetingId.slice(0, 8) })}
    </div>
  );
}
