/**
 * 매장 오너 컴팩트 셸 레이아웃 — Tailwind·JS·CSS 단일 계약.
 * 시각 규칙은 `app/owner-compact-shell.css`, 브레이크 상한은 `owner-compact-shell-viewport.ts`.
 */

export const OWNER_COMPACT_SHELL_BODY_DATA_ATTR = "data-owner-compact-shell";

export const OWNER_COMPACT_SHELL_HEADER_CLASS = "owner-compact-shell__header";
export const OWNER_COMPACT_SHELL_HEADER_INNER_CLASS = "owner-compact-shell__header-inner";
export const OWNER_COMPACT_SHELL_MAIN_CLASS = "owner-compact-shell__main";
export const OWNER_COMPACT_SHELL_COLUMN_CLASS = "owner-compact-shell__column";
export const OWNER_COMPACT_SHELL_SCROLL_CLASS = "owner-compact-shell__scroll";
export const OWNER_COMPACT_SHELL_MAIN_PB_CLASS = "owner-compact-shell__main-pb";
export const OWNER_COMPACT_SHELL_BLEED_X_CLASS = "owner-compact-shell__bleed-x";
export const OWNER_STORE_ADMIN_FOOTER_BAR_CLASS = "owner-store-admin-footer-bar";

/** `BusinessAdminShell` — compact 일 때 `document.body` 토글 */
export function applyOwnerCompactShellBodyFlag(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) document.body.setAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR, "");
  else document.body.removeAttribute(OWNER_COMPACT_SHELL_BODY_DATA_ATTR);
}
