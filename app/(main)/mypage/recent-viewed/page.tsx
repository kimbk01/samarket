"use client";

import { RecentViewedList } from "@/components/recent-viewed/RecentViewedList";
import { MypageSubpageShell } from "@/components/mypage/i18n/MypageSubpageShell";

export default function MypageRecentViewedPage() {
  return (
    <MypageSubpageShell
      titleKey="route_recent_viewed_title"
      subtitleKey="route_recent_viewed_subtitle"
      bodyClassName="min-h-0 w-full min-w-0 flex-1 overflow-y-auto py-4"
    >
      <RecentViewedList />
    </MypageSubpageShell>
  );
}
