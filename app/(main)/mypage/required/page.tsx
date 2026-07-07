"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { RequiredInfoFlowClient } from "@/components/mypage/required/RequiredInfoFlowClient";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";
import { MYPAGE_MAIN_HREF } from "@/lib/my/mypage-info-hub";

export default function MypageRequiredFlowPage() {
  const { safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app" data-testid="mypage-required-flow-page">
      <MySubpageHeader
        title={safeT("mypage_required_section_title", {
          fallbackKo: "필수 정보",
          fallbackEn: "Required info",
        })}
        backHref={MYPAGE_MAIN_HREF}
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <RequiredInfoFlowClient />
      </div>
    </div>
  );
}
