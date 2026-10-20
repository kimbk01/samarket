import { OWNER_STORE_ADMIN_FOOTER_BAR_CLASS } from "@/lib/business/owner-compact-shell-layout";
import { OWNER_DESKTOP_SHELL_MIN_TW } from "@/lib/business/owner-compact-shell-viewport";
import { OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS } from "@/lib/business/owner-admin-form-keyboard";
import { BOTTOM_NAV_SHELL } from "@/lib/main-menu/bottom-nav-config";
import { FIXED_BOTTOM_BAR_MARKER_CLASS } from "@/lib/layout/fixed-bottom-bar-occupancy";

/**
 * 매장 오너 어드민 하단 취소·저장(제출) 바 — divide-x 패턴.
 * Keyboard / safe inset: `lib/business/owner-admin-form-keyboard.ts` + `useOwnerAdminFormKeyboard`
 * (`BusinessApplyForm`, `OwnerStoreProfileForm`, `OwnerStoreBasicInfoForm`, menu-categories).
 */
/** `sam-fixed-bottom-bar` — 고객센터 FAB 가 이 바 위로 비킨다 (`SupportFabHost`) */
export const OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS =
  `${FIXED_BOTTOM_BAR_MARKER_CLASS} pointer-events-none fixed inset-x-0 z-[54] border-t border-sam-border bg-sam-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-surface/88`;

/**
 * @deprecated Keyboard forms must use `ownerStoreAdminFooterFixedClass` +
 * `ownerAdminFormFooterInsetStyle(effectiveBottomInset)` — do not stack safe-bottom.
 */
export const OWNER_STORE_ADMIN_FOOTER_FIXED_BOTTOM_CLASS =
  "bottom-0 pb-[var(--safe-bottom)]";

/**
 * @deprecated Keyboard forms must use `ownerAdminFormBodyPadStyle(effectiveBottomInset)`.
 */
export const OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS =
  "pb-[calc(60px+var(--safe-bottom))]";

/**
 * Inner width follows compact shell `--owner-shell-content-max` via
 * `.owner-store-admin-footer-bar` — no parallel hardcoded max-width.
 */
export const OWNER_STORE_ADMIN_FOOTER_INNER_CLASS =
  `pointer-events-auto mx-auto w-full min-w-0 px-2 ${OWNER_STORE_ADMIN_FOOTER_BAR_CLASS} ${OWNER_DESKTOP_SHELL_MIN_TW}:px-2`;

export const OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS =
  "flex min-w-0 divide-x divide-sam-border";

const OWNER_STORE_ADMIN_FOOTER_BTN_BASE = `${BOTTOM_NAV_SHELL.heightClass} min-w-0 flex-1 rounded-none border-0 px-2 sam-text-body font-medium disabled:opacity-50`;

/** 취소 — `bg-sam-surface` + `text-signature` */
export const OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-sam-surface text-signature`;

/** 저장·제출 — `bg-signature` + 흰 글자 */
export const OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-signature text-white`;

/**
 * 저장·제출 비활성 = 회색 토큰 배경 + 회색 글자 (불투명도 처리 금지 · 설계서 v3 §3).
 * `OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS` 뒤에 붙여 `disabled:opacity-50` 을 덮는다.
 */
export const OWNER_STORE_ADMIN_FOOTER_PRIMARY_DISABLED_TOKEN_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-100 disabled:bg-[color:var(--sam-primary-disabled)] disabled:text-sam-muted";

/**
 * Keyboard-aware fixed footer position (Apply pattern).
 * Pair with `ownerAdminFormFooterInsetStyle(effectiveBottomInset)` — no `pb-[var(--safe-bottom)]`.
 */
export function ownerStoreAdminFooterFixedClass(options?: { aboveBottomNav?: boolean }): string {
  if (options?.aboveBottomNav) {
    return `${OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS} ${OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS}`;
  }
  return `${OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS} bottom-0`;
}
