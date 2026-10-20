"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

export function MypageCommunityActivityChrome({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("route_community_activity_title")}
        subtitle={t("route_community_activity_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={MYPAGE_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col gap-1 py-4`}>
          {children}
        </div>
      </div>
    </div>
  );
}
