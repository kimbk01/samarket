"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export function MypageCommunityPostsChrome({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_community_posts_title")}
        subtitle={t("route_community_posts_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-1 py-4">{children}</div>
      </div>
    </div>
  );
}
