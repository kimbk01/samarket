"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ProfilePublicEditForm } from "@/components/mypage/profile/ProfilePublicEditForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageProfileEditPage() {
  const { t, safeT } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={safeT("mypage_settings_profile_edit", {
          fallbackKo: "프로필 수정",
          fallbackEn: "Edit profile",
        })}
        backHref="/mypage/profile"
        hideCtaStrip
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <ProfilePublicEditForm />
      </div>
    </div>
  );
}
