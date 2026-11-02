"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";
import { MyScreen } from "@/components/mypage/ds/MyScreen";

export default function MypageOrderNotificationsPage() {
  const { t } = useI18n();
  return (
    <MyScreen title={t("order_notifications_title")} backHref="/notifications" template="settings">
      <div className="flex flex-col">
          <MemberNotificationSettings />
      </div>
    </MyScreen>
  );
}
