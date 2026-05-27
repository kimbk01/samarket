"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORES_HOME_HEADER_ICON_BTN_CLASS } from "@/lib/design/stores-home-header-chrome";
import { STORES_HOME_IDLE_DEFER_MS } from "@/lib/stores/stores-home-perf-marks";
import { myGeneralNotificationUnreadStore } from "@/lib/notifications/notification-unread-badge-store";
import { useSyncExternalStore } from "react";

const PhilifeHeaderNotificationInbox = dynamic(
  () =>
    import("@/components/philife/PhilifeHeaderNotificationInbox").then(
      (m) => m.PhilifeHeaderNotificationInbox
    ),
  { ssr: false }
);

function NotificationBellPlaceholder({ tone: _tone }: { tone: "onPrimary" | "default" }) {
  const { t } = useI18n();
  const unread = useSyncExternalStore(
    myGeneralNotificationUnreadStore.subscribe,
    myGeneralNotificationUnreadStore.getSnapshot,
    myGeneralNotificationUnreadStore.getServerSnapshot
  );
  const showDot = (unread ?? 0) > 0;
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
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[color:var(--dibay-accent)]" aria-hidden />
      : null}
    </button>
  );
}

/** 알림 뱃지·기능 유지 — inbox 패널 그래프는 idle 후 별도 청크 */
export function StoresHomeHeaderNotificationInboxLazy({
  tone = "onPrimary",
}: {
  tone?: "onPrimary" | "default";
}) {
  const [mountInbox, setMountInbox] = useState(false);

  useEffect(() => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => setMountInbox(true), { timeout: STORES_HOME_IDLE_DEFER_MS });
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(() => setMountInbox(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  if (!mountInbox) return <NotificationBellPlaceholder tone={tone} />;
  return <PhilifeHeaderNotificationInbox tone={tone} deferInboxListPrefetch />;
}
