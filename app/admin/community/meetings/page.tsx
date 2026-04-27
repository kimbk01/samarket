"use client";

import Link from "next/link";
import { AdminCommunityEngineMeetingsClient } from "@/components/admin/community/AdminCommunityEngineMeetingsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function AdminCommunityMeetingsEnginePage() {
  const { t } = useI18n();
  return (
    <AdminGuard>
      <div className="space-y-6 p-4">
        <AdminPageHeader titleKey="admin_meetings_page_title" descriptionKey="admin_meetings_page_desc" />
        <div className="flex flex-wrap gap-4 sam-text-body">
          <HistoryBackTextLink fallbackHref="/admin/philife" className="text-sky-700 underline">
            {t("admin_meetings_nav_posts")}
          </HistoryBackTextLink>
          <Link href="/admin/philife/meeting-events" className="text-sky-700 underline">
            {t("admin_meetings_nav_audit_log")}
          </Link>
          <Link href="/admin/philife/meeting-reports" className="text-sky-700 underline">
            {t("admin_meetings_nav_reports")}
          </Link>
        </div>
        <AdminCommunityEngineMeetingsClient />
      </div>
    </AdminGuard>
  );
}
