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
 * Nav lift only (no safe in `bottom`) — safe/keyboard live in `effectiveBottomInset`.
 * Full string for Tailwind JIT.
 */
export const OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS = "bottom-[60px]" as const;

/** Form / edit-scroll body — reserve footer bar + keyboard/safe inset (no second safe-bottom). */
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
