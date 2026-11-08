import { storeProductBuyerVisibilityBlocked } from "@/lib/stores/store-product-buyer-sellability";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";

/**
 * 홈 「배달 매장」 칸에 메뉴가 보이는 조건 — 단일 정의 (감사 E11·중복 2026-11-09).
 * 앱 홈(`/api/home/store-menus`)·어드민 메뉴 수(`/api/admin/home-layout/stores`)·어드민 메뉴 고르기(`store-products`)가 같이 쓴다.
 * = 판매 중(`product_status=active` 는 조회에서) · 검수 반려/대기·숨긴 메뉴 구역 아님 · 사진 있음.
 */
export const HOME_STORE_MENU_SELECT =
  "id, store_id, title, price, discount_price, thumbnail_url, is_featured, is_owner_recommended, sort_order, admin_review_status, store_menu_sections ( is_hidden )" as const;

export function homeStoreMenuHiddenReason(row: {
  thumbnail_url?: string | null;
  admin_review_status?: unknown;
  store_menu_sections?: unknown;
}): "review_or_section" | "no_photo" | null {
  if (storeProductBuyerVisibilityBlocked(row as Record<string, unknown>)) return "review_or_section";
  if (!resolveBrowseFeaturedMenuImageUrl(row.thumbnail_url ?? null)) return "no_photo";
  return null;
}

export function isHomeStoreMenuVisible(row: Parameters<typeof homeStoreMenuHiddenReason>[0]): boolean {
  return homeStoreMenuHiddenReason(row) == null;
}
