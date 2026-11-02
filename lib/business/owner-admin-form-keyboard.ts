/**
 * Owner Admin Form Keyboard / fixed footer SSOT.
 *
 * Reuses Global Form Keyboard (`useFormKeyboardViewport`) — same contract as
 * `/stores/owner/apply` (`BusinessApplyForm`) and consumer forms (profile edit, philife).
 * DO NOT invent a parallel viewport/keyboard authority for owner admin.
 *
 * Consumers apply `effectiveBottomInset` only — never stack `var(--safe-bottom)` on top.
 *
 * @see docs/dibay-global-input-ux-parity-hard-lock.md
 * @see lib/ui/use-form-keyboard-viewport.ts
 */

import type { CSSProperties } from "react";
import { BOTTOM_NAV_SHELL } from "@/lib/main-menu/bottom-nav-config";

/** Matches `BOTTOM_NAV_SHELL.heightClass` (60px) — cancel/save bar content row. */
export const OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX = 60;

/**
 * 하단 탭 위에 붙는 바 — 탭 실제 높이(60px + 홈 원 돌출 `--delivery-home-overhang`) 바로 위, 간격 없음.
 * (구: 68px = 60 + 8px 간격 — 홈 원 돌출 17.6px 를 빼 먹어 바 아래쪽이 탭 띠·홈 원에 가려짐.
 *  탭과의 구분은 간격 대신 바 배경색으로 한다 — Owner S-A 2026-11-03)
 * safe-area·키보드는 `effectiveBottomInset`(푸터 padding) 단독. Full string for Tailwind JIT.
 * ≥1280px: 하단 5탭이 숨겨지므로(IA-20 PC 사이드바, `app/owner-compact-shell.css`) 화면 하단에 붙인다.
 * `owner-admin-footer--above-nav` — marker: keyboard open (`html[data-kb-open]`) drops the nav
 * offset to `bottom: 0` (`app/owner-compact-shell.css`); the nav itself is hidden then.
 */
export const OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS =
  "owner-admin-footer--above-nav bottom-[calc(60px+var(--delivery-home-overhang,0px))] min-[1280px]:bottom-0" as const;

/** Form / edit-scroll body — reserve footer bar + keyboard/safe inset. */
export function ownerAdminFormBodyPadStyle(effectiveBottomInsetPx: number): CSSProperties {
  const inset = Math.max(0, Math.round(effectiveBottomInsetPx));
  return {
    paddingBottom: `calc(${OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX}px + ${inset}px)`,
  };
}

/** Footer element — single inset authority (includes safe when keyboard closed). */
export function ownerAdminFormFooterInsetStyle(effectiveBottomInsetPx: number): CSSProperties {
  const inset = Math.max(0, Math.round(effectiveBottomInsetPx));
  return { paddingBottom: `${inset}px` };
}

/** Sanity: bar height stays aligned with bottom-nav shell token. */
export function ownerAdminFormFooterBarHeightMatchesNavShell(): boolean {
  return BOTTOM_NAV_SHELL.heightClass === `h-[${OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX}px]`;
}
