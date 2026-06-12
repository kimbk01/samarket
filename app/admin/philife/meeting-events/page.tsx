"use client";

import { AdminPhilifeMeetingEventsClient } from "@/components/admin/community/AdminPhilifeMeetingEventsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function AdminPhilifeMeetingEventsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6 p-4">
      <AdminPageHeader titleKey="admin_meeting_events_page_title" descriptionKey="admin_meeting_events_page_desc" />
      <div className="flex flex-wrap gap-3 sam-text-body">
        <HistoryBackTextLink
          fallbackHref="/admin/philife/meetings"
          className="text-sky-700 underline"
        >
          {t("admin_meeting_events_nav_meetings")}
        </HistoryBackTextLink>
        <HistoryBackTextLink fallbackHref="/admin/philife" className="text-sky-700 underline">
          {t("admin_meeting_events_nav_philife")}
        </HistoryBackTextLink>
      </div>
      <AdminPhilifeMeetingEventsClient />
    </div>
  );
}
