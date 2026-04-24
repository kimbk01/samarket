"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyNotificationsView } from "@/components/my/MyNotificationsView";
import { NotificationsSettingsContent } from "@/components/my/settings/NotificationsSettingsContent";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { APP_MAIN_TAB_SCROLL_BODY_CLASS } from "@/lib/ui/app-content-layout";

function MypageNotificationSettingsLink() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

export default function MypageNotificationsPage() {
  const { t } = useI18n();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app">
      <MySubpageHeader
        title={t("common_notifications")}
        subtitle={t("tier1_notifications_subtitle")}
        backHref="/mypage"
        hideCtaStrip
        rightSlot={
          <Link
            href="/mypage/notifications#notification-settings"
            className="sam-header-action flex h-10 w-10 items-center justify-center text-sam-fg"
            aria-label={t("notifications_settings_title")}
            scroll={false}
          >
            <MypageNotificationSettingsLink />
          </Link>
        }
      />
      <div className={APP_MAIN_TAB_SCROLL_BODY_CLASS}>
        <div className="flex min-w-0 flex-col gap-10 py-4">
        <section id="notification-inbox" className="min-w-0 scroll-mt-4" aria-label={t("common_notifications")}>
          <MyNotificationsView />
        </section>
        <section
          id="notification-settings"
          className="min-w-0 scroll-mt-4"
          aria-labelledby="mypage-notifications-settings-heading"
        >
          <h2
            id="mypage-notifications-settings-heading"
            className="mb-3 text-[15px] font-semibold text-sam-fg"
          >
            {t("notifications_settings_title")}
          </h2>
          <p className="mb-4 sam-text-helper text-sam-muted">{t("notifications_settings_subtitle")}</p>
          <NotificationsSettingsContent />
        </section>
        </div>
      </div>
    </div>
  );
}
