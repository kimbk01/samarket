"use client";

import dynamic from "next/dynamic";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  STORES_HOME_HEADER_ICON_BTN_CLASS,
} from "@/lib/design/stores-home-header-chrome";

const Tier1NotificationAnchor = dynamic(
  () =>
    import("@/components/notifications/Tier1NotificationAnchor").then(
      (m) => m.Tier1NotificationAnchor
    ),
  { ssr: false, loading: () => <NotificationBellPlaceholder /> }
);

/**
 * Phase J2a — loading shell only. DO NOT show legacy surface unread_count digit
 * (Domain Bell digit lives in Tier1NotificationAnchor after chunk load).
 */
function NotificationBellPlaceholder() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={`relative ${STORES_HOME_HEADER_ICON_BTN_CLASS}`}
      aria-label={t("common_notifications")}
      aria-busy="true"
    >
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden className="h-5 w-5">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
    </button>
  );
}

/** 알림 — inbox 청크는 dynamic 유지. 배지 digit 은 Domain Bell(Anchor)만. */
export function StoresHomeHeaderNotificationInboxLazy({
  tone = "onPrimary",
}: {
  tone?: "onPrimary" | "default";
}) {
  return <Tier1NotificationAnchor surface="bottom_nav_delivery" tone={tone} />;
}
