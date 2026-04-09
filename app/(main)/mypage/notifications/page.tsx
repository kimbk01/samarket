"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageNotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("notifications_settings_title")}
        subtitle={t("notifications_settings_subtitle")}
        backHref="/mypage"
        hideCtaStrip
      />
      <div className={`${APP_MYPAGE_SUBPAGE_NARROW_BODY_CLASS} py-4`}>
        <NotificationsSettingsContent />
      </div>
    </div>
  );
}
