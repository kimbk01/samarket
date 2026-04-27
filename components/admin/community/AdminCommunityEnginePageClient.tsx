"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminCommunityEnginePostsClient } from "@/components/admin/community/AdminCommunityEnginePostsClient";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export function AdminCommunityEnginePageClient() {
  const { t: tr } = useI18n();
  return (
    <div className="space-y-6 p-4">
      <AdminPageHeader titleKey="admin_community_engine_title" descriptionKey="admin_community_engine_desc" />
      <nav className="flex flex-wrap gap-3 sam-text-body text-sky-700">
        <Link href="/admin/philife/reports" className="underline">
          {tr("admin_community_engine_nav_feed_reports")}
        </Link>
        <Link href="/admin/philife/meeting-reports" className="underline">
          {tr("admin_community_engine_nav_meeting_reports")}
        </Link>
        <Link href="/admin/philife/meetings" className="underline">
          {tr("admin_community_engine_nav_meetings")}
        </Link>
        <Link href="/admin/philife/sections" className="underline">
          {tr("admin_community_engine_nav_sections")}
        </Link>
        <Link href="/admin/philife/topics" className="underline">
          {tr("admin_community_engine_nav_topics")}
        </Link>
      </nav>
      <AdminCommunityEnginePostsClient />
    </div>
  );
}
