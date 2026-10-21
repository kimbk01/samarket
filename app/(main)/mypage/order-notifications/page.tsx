"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MemberNotificationSettings } from "@/components/member-orders/MemberNotificationSettings";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MYPAGE_BODY_COLUMN_CLASS, MYPAGE_SCROLL_BODY_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

export default function MypageOrderNotificationsPage() {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("order_notifications_title")}
        subtitle={t("order_notifications_subtitle")}
        backHref="/notifications"
        hideCtaStrip
      />
      <div className={MYPAGE_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} py-4`}>
          <MemberNotificationSettings />
        </div>
      </div>
    </div>
  );
}
