/** 관리자 셸 UI 로컬 설정 (localStorage) */

export const ADMIN_SIDEBAR_EXPANDED_KEY = "admin-sidebar-expanded";
export const ADMIN_ALARM_MUTED_KEY = "admin-alarm-muted";

/** 저장된 선택이 없을 때 사이드 메뉴를 compact(5rem/72px)로 시작하는 폭 구간 [min, maxExclusive). */
export const ADMIN_SIDEBAR_COMPACT_DEFAULT_MIN_WIDTH = 1024;
export const ADMIN_SIDEBAR_COMPACT_DEFAULT_MAX_WIDTH_EXCLUSIVE = 1280;

/**
 * 사이드 메뉴 펼침 여부 — 저장된 사용자 선택("1"/"0")이 항상 우선.
 * 선택이 없으면 1024–1279px 은 compact, 그 외(≥1280 등)는 기존 기본(펼침).
 */
export function resolveSidebarExpanded(stored: string | null, viewportWidth: number | null): boolean {
  if (stored === "0") return false;
  if (stored === "1") return true;
  if (
    viewportWidth != null &&
    viewportWidth >= ADMIN_SIDEBAR_COMPACT_DEFAULT_MIN_WIDTH &&
    viewportWidth < ADMIN_SIDEBAR_COMPACT_DEFAULT_MAX_WIDTH_EXCLUSIVE
  ) {
    return false;
  }
  return true;
}

export function readSidebarExpanded(): boolean {
  if (typeof window === "undefined") return true;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(ADMIN_SIDEBAR_EXPANDED_KEY);
  } catch {
    stored = null;
  }
  return resolveSidebarExpanded(stored, window.innerWidth);
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

/** 사이드바 섹션 펼침 기억 (감사 UX-05) — 섹션 key 별 "1"/"0". 저장 실패해도 동작은 기본값으로 */
export const ADMIN_SIDEBAR_GROUP_OPEN_KEY_PREFIX = "admin-sidebar-group-open:";

export function readSidebarGroupOpen(groupKey: string): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(ADMIN_SIDEBAR_GROUP_OPEN_KEY_PREFIX + groupKey);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function writeSidebarGroupOpen(groupKey: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_SIDEBAR_GROUP_OPEN_KEY_PREFIX + groupKey, open ? "1" : "0");
  } catch {
    /* 저장 불가(사파리 개인 모드 등) — 이번 세션 상태만 유지 */
  }
}

/**
 * 들어온 워크스페이스 기억 (재감사 E-8) — 탭 단위(sessionStorage). 같은 화면이 여러 워크스페이스 메뉴에 있을 때
 * 상세·편집·페이지 이동에서도 들어온 워크스페이스를 유지한다. 저장 실패 시 원래 메뉴 기준으로 동작.
 */
export const ADMIN_ENTRY_WORKSPACE_KEY = "admin-entry-workspace";

export function readAdminEntryWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(ADMIN_ENTRY_WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function writeAdminEntryWorkspace(workspaceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADMIN_ENTRY_WORKSPACE_KEY, workspaceId);
  } catch {
    /* 저장 불가 — 이번 화면 상태만 유지 */
  }
}
