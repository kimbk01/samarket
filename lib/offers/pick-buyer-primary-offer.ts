import type { PriceOfferListItem } from "@/lib/offers/types";

function createdMs(iso: string): number {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 상품 상세 하단 CTA·구매자 카드용 — 동일 상품에 수락 건이 하나라도 있으면 그중 최신 수락을 우선한다.
 * (과거 거절 행이 배열 앞에 오더라도 [다시 제안하기]로 오인하지 않게 함)
 */
export function pickBuyerPrimaryOffer(offers: PriceOfferListItem[]): PriceOfferListItem | null {
  if (!Array.isArray(offers) || offers.length === 0) return null;
  const accepted = offers.filter((o) => o.status === "accepted");
  if (accepted.length > 0) {
    return accepted.reduce((best, o) => (createdMs(o.createdAt) >= createdMs(best.createdAt) ? o : best));
  }
  return [...offers].sort((a, b) => createdMs(b.createdAt) - createdMs(a.createdAt))[0] ?? null;
}
