"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { SettingsHeader } from "@/components/my/settings/SettingsHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageLogoutPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <SettingsHeader title={t("settings_logout")} subtitle={null} />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <LogoutActionTrigger autoOpen />
      </div>
    </div>
  );
}
