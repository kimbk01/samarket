"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageRequiredDibayIdClient } from "@/components/mypage/required/MypageRequiredDibayIdClient";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageRequiredDibayIdPage() {
  const { safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("mypage_required_dibay_id", {
          fallbackKo: "@아이디",
          fallbackEn: "@ ID",
        })}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <MypageRequiredDibayIdClient />
      </div>
    </div>
  );
}
