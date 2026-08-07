"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  writeSidebarExpanded,
  readAlarmMuted,
  writeAlarmMuted,
} from "@/lib/admin-ui-prefs";

function IconSidebarOpen() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="14 10 11 12 14 14" />
    </svg>
  );
}

function IconSidebarClose() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="9" y1="4" x2="9" y2="20" />
      <polyline points="11 10 14 12 11 14" />
    </svg>
  );
}

function IconBellOn() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconBellOff() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8.7 3a6 6 0 0 1 9.1 6.5c0 3.4.9 5.4 1.9 6.5H3" />
      <path d="M10.3 21h3.4a1.94 1.94 0 0 0 1.75-1.1" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

const iconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center border border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app hover:text-sam-fg";

export function AdminShellToolbar({
  sidebarExpanded,
  onSidebarExpandedChange,
}: {
  sidebarExpanded: boolean;
  onSidebarExpandedChange: (expanded: boolean) => void;
}) {
  const { t } = useI18n();
  const [alarmMuted, setAlarmMuted] = useState(false);

  useEffect(() => {
    setAlarmMuted(readAlarmMuted());
  }, []);

  const toggleSidebar = () => {
    const next = !sidebarExpanded;
    onSidebarExpandedChange(next);
    writeSidebarExpanded(next);
  };

  const toggleAlarm = () => {
    const next = !alarmMuted;
    setAlarmMuted(next);
    writeAlarmMuted(next);
  };

  const sidebarToggleLabel = sidebarExpanded
    ? t("admin_shell_sidebar_collapse")
    : t("admin_shell_sidebar_expand");

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-pressed={sidebarExpanded}
        aria-label={sidebarToggleLabel}
        className={`${iconBtnClass} hidden md:inline-flex rounded-sm`}
        title={sidebarToggleLabel}
      >
        {sidebarExpanded ? <IconSidebarClose /> : <IconSidebarOpen />}
      </button>
      <button
        type="button"
        onClick={toggleAlarm}
        aria-pressed={alarmMuted}
        aria-label={alarmMuted ? t("admin_shell_alarm_unmute") : t("admin_shell_alarm_mute")}
        className={iconBtnClass}
        title={
          alarmMuted ? t("admin_shell_alarm_unmute") : t("admin_shell_alarm_mute_detail")
        }
      >
        {alarmMuted ? <IconBellOff /> : <IconBellOn />}
      </button>
    </div>
  );
}
