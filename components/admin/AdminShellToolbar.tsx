"use client";

import { useEffect, useState } from "react";
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

  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-pressed={sidebarExpanded}
        aria-label={sidebarExpanded ? "사이드 메뉴 접기" : "사이드 메뉴 펼치기"}
        className={iconBtnClass}
        title={sidebarExpanded ? "사이드 메뉴 접기" : "사이드 메뉴 펼치기"}
      >
        {sidebarExpanded ? <IconSidebarClose /> : <IconSidebarOpen />}
      </button>
      <button
        type="button"
        onClick={toggleAlarm}
        aria-pressed={alarmMuted}
        aria-label={alarmMuted ? "알람 소리 켜기" : "알람 음소거"}
        className={iconBtnClass}
        title={
          alarmMuted
            ? "알람 소리 켜기"
            : "알람 음소거 (벨 클릭 시 소리 없음)"
        }
      >
        {alarmMuted ? <IconBellOff /> : <IconBellOn />}
      </button>
    </div>
  );
}
