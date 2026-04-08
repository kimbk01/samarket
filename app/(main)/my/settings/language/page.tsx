"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { LanguageSettingsContent } from "@/components/my/settings/LanguageSettingsContent";

export default function LanguagePage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title={t("language_settings_title")} backHref="/my/settings" />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <LanguageSettingsContent />
      </div>
    </div>
  );
}
