/**
 * WP4 — 2단 탭 전환 방향 (헤더 탭 → 목록 가로 슬라이드).
 * 헤더가 누른 순간 기록하고, 목록이 새 탭 데이터를 그릴 때 1회 소비한다.
 */
export type BrowseMenuTabDirection = "forward" | "back";

let pending: BrowseMenuTabDirection | null = null;

export function noteBrowseMenuTabDirection(direction: BrowseMenuTabDirection): void {
  pending = direction;
}

export function consumeBrowseMenuTabDirection(): BrowseMenuTabDirection | null {
  const d = pending;
  pending = null;
  return d;
}

/** 배민 실측 탭 본문 이동 약 130~200ms */
export const BROWSE_MENU_TAB_CONTENT_SLIDE_MS = 180;
