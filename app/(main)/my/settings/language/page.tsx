"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function LanguagePage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title={t("language_settings_title")} />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <LanguageSettingsContent />
      </div>
    </div>
  );
}
