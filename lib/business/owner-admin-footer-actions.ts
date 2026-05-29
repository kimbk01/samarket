import { OWNER_STORE_ADMIN_FOOTER_BAR_CLASS } from "@/lib/business/owner-compact-shell-layout";
import { OWNER_DESKTOP_SHELL_MIN_TW } from "@/lib/business/owner-compact-shell-viewport";
import {
  BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS,
  BOTTOM_NAV_SHELL,
} from "@/lib/main-menu/bottom-nav-config";

/**
 * 매장 오너 어드민 하단 취소·저장(제출) 바 — `/stores/owner/apply` 와 동일 divide-x 패턴.
 * (`OwnerStoreProfileForm`, `OwnerStoreBasicInfoForm`, `BusinessApplyForm`)
 */
export const OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS =
  "pointer-events-none fixed inset-x-0 z-[54] border-t border-sam-border bg-sam-surface/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-surface/88";

export const OWNER_STORE_ADMIN_FOOTER_FIXED_BOTTOM_CLASS =
  "bottom-0 pb-[env(safe-area-inset-bottom,0px)]";

/** 고정 footer 높이(`BOTTOM_NAV_SHELL.heightClass`) + safe-area — 폼 하단 패딩 */
export const OWNER_STORE_ADMIN_FOOTER_FORM_PAD_CLASS =
  "pb-[calc(60px+env(safe-area-inset-bottom,0px))]";

export const OWNER_STORE_ADMIN_FOOTER_INNER_CLASS =
  `pointer-events-auto mx-auto w-full max-w-[42rem] px-2 ${OWNER_STORE_ADMIN_FOOTER_BAR_CLASS} ${OWNER_DESKTOP_SHELL_MIN_TW}:px-2`;

export const OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS =
  "flex min-w-0 divide-x divide-sam-border";

const OWNER_STORE_ADMIN_FOOTER_BTN_BASE = `${BOTTOM_NAV_SHELL.heightClass} min-w-0 flex-1 rounded-none border-0 px-2 sam-text-body font-medium disabled:opacity-50`;

/** 취소 — `bg-sam-surface` + `text-signature` */
export const OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-sam-surface text-signature`;

/** 저장·제출 — `bg-signature` + 흰 글자 */
export const OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS = `${OWNER_STORE_ADMIN_FOOTER_BTN_BASE} bg-signature text-white`;

export function ownerStoreAdminFooterFixedClass(options?: { aboveBottomNav?: boolean }): string {
  return options?.aboveBottomNav
    ? `${OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS} ${BOTTOM_NAV_FIX_OFFSET_ABOVE_BOTTOM_CLASS}`
    : `${OWNER_STORE_ADMIN_FOOTER_FIXED_SHELL_CLASS} ${OWNER_STORE_ADMIN_FOOTER_FIXED_BOTTOM_CLASS}`;
}
