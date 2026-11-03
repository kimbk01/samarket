import { OWNER_STORE_ADMIN_FOOTER_BAR_CLASS } from "@/lib/business/owner-compact-shell-layout";
import { OWNER_ADMIN_FORM_FOOTER_ABOVE_NAV_BOTTOM_CLASS } from "@/lib/business/owner-admin-form-keyboard";
import { BOTTOM_NAV_SHELL } from "@/lib/main-menu/bottom-nav-config";
import { FIXED_BOTTOM_BAR_MARKER_CLASS } from "@/lib/layout/fixed-bottom-bar-occupancy";

/**
 * 매장 오너 어드민 하단 취소·저장(제출) 바 — divide-x 패턴.
 * Keyboard / safe inset: `lib/business/owner-admin-form-keyboard.ts` + `useOwnerAdminFormKeyboard`
 * (`BusinessApplyForm`, `OwnerStoreProfileForm`, `OwnerStoreBasicInfoForm`, menu-categories).
 */
/**
 * `sam-fixed-bottom-bar` — 고객센터 FAB 가 이 바 위로 비킨다 (`SupportFabHost`).
 * 배경 = 브랜드 그린(`bg-sam-primary` #0B421A) — 하단 탭(크림 #FFFCFC)과 한눈에 구분 (Owner 재설계안 승인 2026-11-03).
 * 이전 `--sam-primary-soft` 는 그린 9% 섞음(#E9EBE8)이라 회색으로 보여 구분이 안 됐음.
 */
export const OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS =
  `${FIXED_BOTTOM_BAR_MARKER_CLASS} pointer-events-none fixed inset-x-0 z-[54] bg-sam-primary`;

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
 * 폭 = 하단 탭과 같은 화면 전체 폭(좌우 안전영역만) — `.owner-store-admin-footer-bar` (Owner S-A 2026-11-03).
 */
export const OWNER_STORE_ADMIN_FOOTER_INNER_CLASS =
  `pointer-events-auto w-full min-w-0 ${OWNER_STORE_ADMIN_FOOTER_BAR_CLASS}`;

export const OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS =
  "flex min-w-0 divide-x divide-white/25";

/** 바 안 한 줄 안내(예: 신청 불가 사유) — 그린 바 위라 흰 글자 */
export const OWNER_STORE_ADMIN_FOOTER_HINT_CLASS =
  "truncate border-b border-white/25 px-2 py-1.5 text-center text-[12px] leading-4 text-white";

/**
 * 높이 = 하단 탭 높이(`BOTTOM_NAV_SHELL.heightClass`) · `<Link>` 취소도 글자 가운데 정렬.
 * 눌림 = 밝기만 낮춤(비활성은 눌림 없음) · 비활성 = 회색 토큰(불투명도 처리 금지 · 설계서 v3 §3) — 모든 화면 공통.
 */
const OWNER_STORE_ADMIN_FOOTER_BTN_BASE = `${BOTTOM_NAV_SHELL.heightClass} inline-flex min-w-0 flex-1 items-center justify-center rounded-none border-0 px-2 sam-text-body font-medium touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[filter] duration-100 active:brightness-90 disabled:cursor-not-allowed disabled:active:brightness-100`;

/** 취소 — 바 배경(그린) 그대로 + 흰 글자 · 비활성 = 회색 토큰 글자 */
export const OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-transparent text-white disabled:text-[color:var(--sam-primary-disabled)]`;

/** 저장·제출 — 흰 바탕 + 그린 글자 · 비활성 = 회색 토큰 배경 + 회색 글자 (불투명도 처리 금지 · 설계서 v3 §3) */
export const OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-sam-surface text-signature disabled:bg-[color:var(--sam-primary-disabled)] disabled:text-sam-muted`;

/**
 * 저장·제출 비활성 = 회색 토큰 배경 + 회색 글자 (불투명도 처리 금지 · 설계서 v3 §3).
 * S-A(2026-11-03)부터 `OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS` 에 포함 — 신청 화면 호환용으로만 남김.
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
