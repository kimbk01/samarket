"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";

export default function MypageOrderNotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("order_notifications_title")}
        subtitle={t("order_notifications_subtitle")}
        backHref="/mypage/notifications"
        hideCtaStrip
      />
      <div className="mx-auto max-w-[480px] px-4 py-4">
        <MemberNotificationSettings />
      </div>
    </div>
  );
}
