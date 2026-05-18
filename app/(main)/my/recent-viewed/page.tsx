"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";

export default function RecentViewedPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("route_recent_viewed_title")}
        subtitle={t("route_recent_viewed_subtitle")}
        backHref="/mypage"
        section="board"
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        <RecentViewedList />
      </div>
    </div>
  );
}
