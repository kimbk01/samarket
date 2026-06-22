"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageSettingsHomeView } from "@/components/mypage/settings/MypageSettingsHomeView";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageSettingsPage() {
  const { safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("mypage_settings_sheet_title", {
          fallbackKo: "설정",
          fallbackEn: "Settings",
        })}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} px-4 py-2 sm:px-5`}>
        <MypageSettingsHomeView />
      </div>
    </div>
  );
}
