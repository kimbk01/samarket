"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

export default function MypageOrderNotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("order_notifications_title")}
        subtitle={t("order_notifications_subtitle")}
        backHref="/mypage/notifications"
        hideCtaStrip
      />
      <div className={`${APP_MAIN_TAB_SCROLL_BODY_CLASS} py-4`}>
        <MemberNotificationSettings />
      </div>
    </div>
  );
}
