"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyAccountContent } from "@/components/my/MyAccountContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageAccountPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("account_title")}
        subtitle={t("account_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className="mx-auto max-w-lg px-4 py-4">
        <MyAccountContent />
      </div>
    </div>
  );
}
