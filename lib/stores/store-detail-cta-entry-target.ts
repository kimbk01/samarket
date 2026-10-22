/**
 * ADC-06 — 배너·팝업 CTA 착지점(`owner-banner-contract.ts` resolveOwnerBannerCtaHref ·
 * `popup-cta-destination-ux.ts`) 을 매장 상세가 해석한다.
 * - `#menu` → 메뉴 영역
 * - `?tab=promo` → 매장 프로모션 영역(매장 배너·공지)
 * `?focusProduct=` 진입은 기존 메뉴 포커스 경로가 담당하므로 여기서는 무시한다.
 */

export type StoreDetailCtaEntryTarget = "menu" | "promo";

/** 매장 프로모션 영역 앵커 id (StoreDetailPublic bannersSlot 래퍼). */
export const STORE_DETAIL_PROMO_ANCHOR_ID = "store-detail-promo";

export function resolveStoreDetailCtaEntryTarget(input: {
  search: string | null | undefined;
  hash: string | null | undefined;
}): StoreDetailCtaEntryTarget | null {
  const params = new URLSearchParams(String(input.search ?? "").replace(/^\?/, ""));
  if (params.get("focusProduct")?.trim()) return null;
  if (String(input.hash ?? "").replace(/^#/, "").trim().toLowerCase() === "menu") return "menu";
  if (params.get("tab")?.trim().toLowerCase() === "promo") return "promo";
  return null;
}
