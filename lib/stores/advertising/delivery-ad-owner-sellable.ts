/**
 * 사장님에게 파는 배달 광고 지면 판정 단일 정의 (광고 감사 E · 2026-11-26).
 * 사장님 신청 목록 API(`/api/me/delivery-ads/commercial`)와 광고 요금 안내(`ad-pricing-guide.ts`)가 같이 쓴다 —
 * 요금 안내에 나온 줄 = 사장님이 실제로 신청할 수 있는 지면.
 *
 * 조건: 지면 판매 켬 · 출시 판매 지면 · 검색 상단 제외(코드 고정) · 배달 홈 홍보는 노출 자리 켜짐(SA-01)
 * · 업종 목록은 업종 광고 켜짐(R-23 — 사장님 목록은 그 매장 업종, 요금 안내는 켜진 업종 1개 이상).
 */
import type { DeliveryAdPlacementCommercialRow } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { isLaunchSellableInventoryKey } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { STORES_SEARCH_TOP_LAUNCH } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { STORES_HOME_FEED_INVENTORY_KEY } from "@/lib/stores/advertising/delivery-ad-home-feed-sell-gate";

export const STORES_CATEGORY_FEED_INVENTORY_KEY = "STORES_CATEGORY_FEED" as const;

export function isOwnerSellableDeliveryAdPlacement(
  placement: Pick<DeliveryAdPlacementCommercialRow, "productKind" | "inventoryKey" | "sellable">,
  productKind: string,
  gates: { homeFeedSellable: boolean; categoryFeedSellable: boolean }
): boolean {
  return (
    placement.productKind === productKind &&
    placement.sellable &&
    isLaunchSellableInventoryKey(placement.inventoryKey) &&
    placement.inventoryKey !== STORES_SEARCH_TOP_LAUNCH.inventoryKey &&
    (placement.inventoryKey !== STORES_HOME_FEED_INVENTORY_KEY || gates.homeFeedSellable) &&
    (placement.inventoryKey !== STORES_CATEGORY_FEED_INVENTORY_KEY || gates.categoryFeedSellable)
  );
}
