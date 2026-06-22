"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageRequiredPhoneClient } from "@/components/mypage/required/MypageRequiredPhoneClient";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageRequiredPhonePage() {
  const { safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("mypage_required_phone", {
          fallbackKo: "전화번호 인증",
          fallbackEn: "Phone verification",
        })}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <MypageRequiredPhoneClient />
      </div>
    </div>
  );
}
