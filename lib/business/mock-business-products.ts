/**
 * 21단계: 상점 상품 mock (MOCK_PRODUCTS 기반, ownerUserId = sellerId 매칭)
 */

import type { BusinessProduct } from "@/lib/types/business";
import { getBusinessProfileById } from "./mock-business-profiles";
import { MOCK_PRODUCTS } from "@/lib/mock-products";

function getSellerId(p: (typeof MOCK_PRODUCTS)[0]): string | undefined {
  return p.sellerId ?? p.seller?.id;
}

export function getBusinessProducts(
  businessProfileId: string
): BusinessProduct[] {
  const profile = getBusinessProfileById(businessProfileId);
  if (!profile) return [];
  const ownerId = profile.ownerUserId;
  return MOCK_PRODUCTS.filter((p) => getSellerId(p) === ownerId)
    .filter((p) => !["hidden", "blinded", "deleted"].includes(p.status))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .map((p) => ({
      id: p.id,
      businessProfileId,
      title: p.title,
      price: p.price,
      thumbnail: p.thumbnail || "",
      status: p.status,
      createdAt: p.createdAt,
    }));
}
