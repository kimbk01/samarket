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

/** Visible separation between action footer and OwnerMobileBottomNav (shell gap, not ads-local). */
export const OWNER_ADMIN_FORM_FOOTER_NAV_GAP_PX = 8;

/**
 * Nav lift + gap only (no safe in `bottom`) — safe/keyboard live in `effectiveBottomInset`.
 * 60 nav + 8 gap = 68. Full string for Tailwind JIT.
 */
export const OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS = "bottom-[68px]" as const;

/** Form / edit-scroll body — reserve footer bar + nav gap + keyboard/safe inset. */
export function ownerAdminFormBodyPadStyle(effectiveBottomInsetPx: number): CSSProperties {
  const inset = Math.max(0, Math.round(effectiveBottomInsetPx));
  const reserve =
    OWNER_ADMIN_FORM_FOOTER_BAR_HEIGHT_PX + OWNER_ADMIN_FORM_FOOTER_NAV_GAP_PX;
  return {
    paddingBottom: `calc(${reserve}px + ${inset}px)`,
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
