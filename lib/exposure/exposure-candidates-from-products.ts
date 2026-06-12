import type { ExposureCandidate } from "@/lib/types/exposure";
import type { Product } from "@/lib/types/product";
import type { PointPromotionOrder } from "@/lib/types/point";
import { resolvePointPromotionStatus } from "@/lib/exposure/point-promotion-exposure";

const excludeStatus = ["hidden", "blinded", "deleted"] as const;

function parseLocation(location: string): { region: string; city: string; barangay: string } {
  const parts = (location ?? "").split("·").map((s) => s.trim());
  return {
    region: parts[0] ?? "",
    city: parts[1] ?? "",
    barangay: parts[2] ?? "",
  };
}

export function productToExposureCandidate(
  p: Product,
  promotionOrders: PointPromotionOrder[] = []
): ExposureCandidate {
  const sellerId = p.sellerId ?? p.seller?.id ?? "";
  const sellerNickname = p.seller?.nickname ?? "";
  const { region, city, barangay } = parseLocation(p.location ?? "");

  return {
    id: p.id,
    title: p.title,
    sellerId,
    sellerNickname,
    memberType: "normal",
    businessProfileId: null,
    isBusinessItem: false,
    price: p.price,
    status: p.status,
    likesCount: p.likesCount ?? 0,
    chatCount: p.chatCount ?? 0,
    viewCount: p.viewCount ?? 0,
    createdAt: p.createdAt,
    bumpedAt: p.bumpedAt ?? null,
    region,
    city,
    barangay,
    distance: p.distance ?? 999,
    adPromotionStatus: "none",
    pointPromotionStatus: resolvePointPromotionStatus(p.id, promotionOrders),
    shopFeaturedStatus: "none",
  };
}

export function getCandidatesFromProducts(
  products: Product[],
  promotionOrders: PointPromotionOrder[] = []
): ExposureCandidate[] {
  return products
    .filter((p) => !excludeStatus.includes(p.status as (typeof excludeStatus)[number]))
    .map((p) => productToExposureCandidate(p, promotionOrders));
}
