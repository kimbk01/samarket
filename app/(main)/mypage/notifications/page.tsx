"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageNotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("notifications_settings_title")}
        subtitle={t("notifications_settings_subtitle")}
        backHref="/mypage"
        section="account"
      />
      <div className="mx-auto max-w-[480px] bg-white px-4 py-4">
        <NotificationsSettingsContent />
      </div>
    </div>
  );
}
