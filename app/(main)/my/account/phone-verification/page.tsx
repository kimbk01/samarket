"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PhoneVerificationRequestForm } from "@/components/my/PhoneVerificationRequestForm";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MyPhoneVerificationPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_phone_verify_title")}
        subtitle={t("mypage_phone_verify_subtitle")}
        backHref="/mypage/account"
        section="account"
        hideCtaStrip
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <PhoneVerificationRequestForm />
      </div>
    </div>
  );
}
