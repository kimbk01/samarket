"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";

export function MypageCommunityPostsChrome({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <MyScreen title={t("route_community_posts_title")} template="list">
      <div className="flex flex-col gap-1">
          {children}
      </div>
    </MyScreen>
  );
}
