"use client";

import { useSyncExternalStore } from "react";

/**
 * C 단계 (Owner 승인 2026-11-10, `docs/audit/app-shell-ssr-c-stage-design-2026-11-10.md`):
 * 앱 셸 hydration 완료 여부. 서버 렌더·hydration 첫 렌더 = false(서버 HTML 과 일치), 직후 = true.
 * hydration 이 아닌 클라이언트 마운트에서는 처음부터 true.
 *
 * 브라우저 저장값(sessionStorage 등)에 따라 달라지는 화면 값은 이 값이 true 일 때만 계산한다 —
 * 서버 HTML 과 첫 클라이언트 렌더가 같아야 hydration 불일치가 생기지 않는다.
 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function useShellHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

/** hydration 전(서버 HTML)에는 하단 메뉴 누름을 막는다 — CSS `html:not([data-shell-hydrated])` (C5). */
export const SHELL_HYDRATED_HTML_ATTR = "data-shell-hydrated";
