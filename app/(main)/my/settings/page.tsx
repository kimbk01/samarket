"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { SettingsMainContent } from "@/components/my/settings/SettingsMainContent";

export default function MySettingsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <SettingsHeader title={t("common_settings")} backHref="/mypage" />
      <div className="px-0 pt-2">
        <SettingsMainContent />
      </div>
    </div>
  );
}
