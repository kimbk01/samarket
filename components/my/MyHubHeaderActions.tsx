"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

type Props = {
  notificationUnreadCount?: number | null;
};

/**
 * 내정보 허브(`/mypage`)에서는 상단 톱니를 두지 않음 — 계정 탭·「내 정보·앱 설정」행으로 통합.
 * 다른 화면에서는 기존처럼 시트 진입용 톱니 유지.
 */
export function MyHubHeaderActions({ notificationUnreadCount }: Props) {
  const pathname = usePathname();
  const { t } = useI18n();
  const hideSettingsGear = pathname === "/mypage";
  const showBadge = notificationUnreadCount != null && notificationUnreadCount > 0;
  const badgeText =
    notificationUnreadCount != null && notificationUnreadCount > 99
      ? "99+"
      : String(notificationUnreadCount ?? "");

  return (
    <div
      className={`flex shrink-0 items-center justify-end gap-0.5 ${hideSettingsGear ? "w-[44px]" : "w-[88px]"}`}
    >
      <Link
        href="/mypage/notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
        aria-label={
          showBadge
            ? t("hub_alert_unread_aria", { count: notificationUnreadCount ?? 0 })
            : t("hub_alert_aria")
        }
      >
        <BellIcon />
        {showBadge ? (
          <span className="pointer-events-none absolute right-0 top-0 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-[var(--sub-bg)]">
            {badgeText}
          </span>
        ) : null}
      </Link>
      {hideSettingsGear ? null : (
        <Link
          href={buildMypageInfoHubHref()}
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
          aria-label={t("hub_settings_aria")}
        >
          <SettingsIcon />
        </Link>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
