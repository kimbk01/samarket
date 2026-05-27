"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  STORES_HOME_HEADER_ICON_BTN_CLASS,
  STORES_HOME_HEADER_NOTIF_BADGE_CLASS,
} from "@/lib/design/stores-home-header-chrome";
import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";
import { useSyncExternalStore } from "react";

const PhilifeHeaderNotificationInbox = dynamic(
  () =>
    import("@/components/philife/PhilifeHeaderNotificationInbox").then(
      (m) => m.PhilifeHeaderNotificationInbox
    ),
  { ssr: false, loading: () => <NotificationBellPlaceholder /> }
);

function NotificationBellPlaceholder() {
  const { t } = useI18n();
  const unread = useSyncExternalStore(
    myGeneralNotificationUnreadStore.subscribe,
    myGeneralNotificationUnreadStore.getSnapshot,
    myGeneralNotificationUnreadStore.getServerSnapshot
  );
  const showDot = (unread ?? 0) > 0;
  const badgeLabel = (unread ?? 0) > 99 ? "99+" : String(unread ?? 0);
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
      {showDot ?
        <span className={STORES_HOME_HEADER_NOTIF_BADGE_CLASS} aria-hidden>
          {badgeLabel}
        </span>
      : null}
    </button>
  );
}

/** 알림 — inbox 청크는 dynamic 유지, 뱃지·Realtime·목록 prefetch 는 즉시 */
export function StoresHomeHeaderNotificationInboxLazy({
  tone = "onPrimary",
}: {
  tone?: "onPrimary" | "default";
}) {
  useEffect(() => {
    void myGeneralNotificationUnreadStore.refresh(true);
  }, []);

  return <PhilifeHeaderNotificationInbox tone={tone} />;
}
