import type { Product } from "@/lib/types/product";
import type { SortKey } from "@/lib/constants/sort";
import { getExposureScorePolicyBySurface } from "@/lib/exposure/mock-exposure-score-policies";
import { getCandidatesFromProducts } from "@/lib/exposure/mock-exposure-candidates";
import { computeAndSortCandidates } from "@/lib/exposure/exposure-score-utils";
import type { UserRegionContext } from "@/lib/exposure/exposure-score-utils";

export function sortProducts(
  products: Product[],
  sortKey: SortKey,
  userRegion?: UserRegionContext | null
): Product[] {
  if (sortKey === "featured") {
    return sortProductsByExposure(products, "home", userRegion ?? null);
  }
  const list = [...products];
  switch (sortKey) {
    case "latest":
      return list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case "popular":
      return list.sort((a, b) => {
        const scoreA = a.likesCount + a.chatCount;
        const scoreB = b.likesCount + b.chatCount;
        return scoreB - scoreA;
      });
    case "nearby":
      return list.sort((a, b) => {
        const distA = a.distance ?? 999;
        const distB = b.distance ?? 999;
        return distA - distB;
      });
    default:
      return list;
  }
}

/** 28단계: 노출 점수 기준 정렬 (featured 정렬용) */
export function sortProductsByExposure(
  products: Product[],
  surface: "home" | "search" | "shop_featured",
  userRegion: UserRegionContext | null
): Product[] {
  if (products.length === 0) return [];
  const policy = getExposureScorePolicyBySurface(surface);
  if (!policy) return [...products];
  const candidates = getCandidatesFromProducts(products);
  const sorted = computeAndSortCandidates(
    candidates,
    policy,
    surface,
    userRegion
  );
  const idOrder = new Map(sorted.map((s, i) => [s.candidate.id, i]));
  return [...products].sort(
    (a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999)
  );
}
