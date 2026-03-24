/**
 * 30단계: 사용자 행동 프로필 mock (찜·채팅·최근 본 상품 기반)
 */

import type { UserBehaviorProfile } from "@/lib/types/personalized-feed";
import { getFavoriteProductIds } from "@/lib/products/mock-favorites";
import { getChatRooms } from "@/lib/chats/mock-chat-rooms";
import { getRecentViewedProductIds } from "./mock-recent-views";
import { getProductById } from "@/lib/mock-products";

function getCategoriesFromProductIds(productIds: string[]): string[] {
  const set = new Set<string>();
  for (const id of productIds) {
    const p = getProductById(id);
    if (p?.category) set.add(p.category);
  }
  return [...set];
}

export function getUserBehaviorProfile(
  userId: string,
  regionLabel?: string
): UserBehaviorProfile {
  const favoriteIds = getFavoriteProductIds(userId);
  const recentViewIds = getRecentViewedProductIds(userId);
  const rooms = getChatRooms(userId);
  const chattedIds = rooms.map((r) => r.productId);

  const [preferredRegion = "", preferredCity = "", preferredBarangay = ""] = (
    regionLabel ?? ""
  )
    .split("·")
    .map((s) => s.trim());

  return {
    userId,
    favoriteCategories: getCategoriesFromProductIds(favoriteIds),
    recentViewedProductIds: recentViewIds,
    recentViewedCategories: getCategoriesFromProductIds(recentViewIds),
    recentFavoritedProductIds: favoriteIds,
    recentFavoritedCategories: getCategoriesFromProductIds(favoriteIds),
    recentChattedProductIds: chattedIds,
    recentChattedCategories: getCategoriesFromProductIds(chattedIds),
    preferredRegion,
    preferredCity,
    preferredBarangay,
    updatedAt: new Date().toISOString(),
  };
}

export function getOrCreateBehaviorProfile(
  userId: string,
  regionLabel?: string
): UserBehaviorProfile {
  return getUserBehaviorProfile(userId, regionLabel);
}
