/** 관리자 셸 UI 로컬 설정 (localStorage) */

export const ADMIN_SIDEBAR_EXPANDED_KEY = "admin-sidebar-expanded";
export const ADMIN_ALARM_MUTED_KEY = "admin-alarm-muted";

export function readSidebarExpanded(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(ADMIN_SIDEBAR_EXPANDED_KEY);
  if (v === "0") return false;
  if (v === "1") return true;
  return true;
}

export function writeSidebarExpanded(expanded: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_SIDEBAR_EXPANDED_KEY, expanded ? "1" : "0");
}

export function readAlarmMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ADMIN_ALARM_MUTED_KEY) === "1";
}

export function writeAlarmMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_ALARM_MUTED_KEY, muted ? "1" : "0");
}

/** 알람 재생 전 호출 — 음소거 시 true */
export function isAdminAlarmMuted(): boolean {
  return readAlarmMuted();
}
