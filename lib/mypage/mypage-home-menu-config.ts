import type { MypageHomeLinkMenuItem } from "@/lib/mypage/mypage-home-menu-types";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerStoreGateState } from "@/lib/stores/store-admin-access";

/**
 * 내정보 홈 메뉴 행 정의 — 분류(IA) 이후 남은 공용 부분만 (2026-11-02).
 * 분류·행 구성의 단일 기준은 `lib/mypage/mypage-ia.ts`. 여기에는 매장 행 판정·고객센터 행만 둔다.
 */
export type {
  MypageHomeLinkMenuItem,
  MypageHomeAddressMenuItem,
  MypageHomeLanguageMenuItem,
  MypageHomeMenuIconId,
  MypageHomeMenuItemConfig,
} from "@/lib/mypage/mypage-home-menu-types";

/**
 * Presentation only — does NOT re-implement `getOwnerStoreGateState`.
 * `null` gate (unknown / guest) → apply entry (same as empty).
 */
export type MypageHomeStoreOwnerEntry = MypageHomeLinkMenuItem & {
  /** pending 계열만 — `formatStoreApprovalStatusI18n` 에 넘길 DB status */
  approvalStatusForBadge?: string | null;
};

export function resolveMypageHomeStoreOwnerEntry(
  gate: OwnerStoreGateState | null,
  firstStoreId?: string | null,
): MypageHomeStoreOwnerEntry {
  if (!gate || gate.kind === "empty") {
    return {
      href: OwnerRoutes.apply(),
      titleKey: "mypage_hub_store_apply",
      icon: "store",
    };
  }
  if (gate.kind === "approved") {
    return {
      href: OwnerRoutes.hub(firstStoreId),
      titleKey: "mypage_comp_menu_store_enter_title",
      icon: "store",
    };
  }
  return {
    href: OwnerRoutes.hub(),
    titleKey: "mypage_comp_menu_store_approval_progress_title",
    icon: "store",
    approvalStatusForBadge: gate.approval_status || null,
  };
}

/**
 * Support — Customer Center hub only (boards + shortcuts live inside hub).
 * Legacy notices / inquiries / inbox flat rows removed after CS cutover.
 */
export const MYPAGE_HOME_SUPPORT_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: "/mypage/customer-center",
    titleKey: "mypage_comp_menu_support_cs_title",
    icon: "help-circle",
  },
];
