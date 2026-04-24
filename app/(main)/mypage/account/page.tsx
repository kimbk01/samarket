"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyAccountContent } from "@/components/my/MyAccountContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageAccountPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("account_title")}
        subtitle={t("account_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <MyAccountContent />
      </div>
    </div>
  );
}
