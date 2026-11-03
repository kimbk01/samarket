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
 * 배경 = 흰 서피스 + 위 테두리. 그린은 「저장·제출」 버튼에만 (Owner 2026-11-04 「하단 그린 배경 빼라」).
 * 이전(2026-11-03) 바 전체 그린은 화면 안 실행 버튼·하단 탭과 같은 색이라 구분이 안 됐음.
 */
export const OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS =
  `${FIXED_BOTTOM_BAR_MARKER_CLASS} pointer-events-none fixed inset-x-0 z-[54] border-t border-sam-border bg-sam-surface`;

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
  "flex min-w-0 divide-x divide-sam-border";

/** 바 안 한 줄 안내(예: 신청 불가 사유) — 흰 바 위 보조 글자 */
export const OWNER_STORE_ADMIN_FOOTER_HINT_CLASS =
  "truncate border-b border-sam-border px-2 py-1.5 text-center text-[12px] leading-4 text-sam-muted";

/**
 * 높이 = 하단 탭 높이(`BOTTOM_NAV_SHELL.heightClass`) · `<Link>` 취소도 글자 가운데 정렬.
 * 눌림 = 밝기만 낮춤(비활성은 눌림 없음) · 비활성 = 회색 토큰(불투명도 처리 금지 · 설계서 v3 §3) — 모든 화면 공통.
 */
const OWNER_STORE_ADMIN_FOOTER_BTN_BASE = `${BOTTOM_NAV_SHELL.heightClass} inline-flex min-w-0 flex-1 items-center justify-center rounded-none border-0 px-2 sam-text-body font-medium touch-manipulation select-none [-webkit-tap-highlight-color:transparent] transition-[filter] duration-100 active:brightness-90 disabled:cursor-not-allowed disabled:active:brightness-100`;

/** 취소 — 흰 바탕 + 기본 글자 (보조) · 비활성 = 회색 글자 */
export const OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-sam-surface text-sam-fg disabled:text-sam-muted`;

/** 저장·제출 — 그린 버튼 + 흰 글자 (바에서 그린은 여기만) · 비활성 = 회색 토큰 배경 + 회색 글자 (불투명도 처리 금지 · 설계서 v3 §3) */
export const OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-sam-primary text-sam-on-primary disabled:bg-[color:var(--sam-primary-disabled)] disabled:text-sam-muted`;

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
