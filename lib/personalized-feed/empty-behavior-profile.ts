import type { UserBehaviorProfile } from "@/lib/types/personalized-feed";

export function createEmptyBehaviorProfile(
  userId: string,
  regionLabel = ""
): UserBehaviorProfile {
  const parts = regionLabel.split("·").map((s) => s.trim());
  return {
    userId,
    favoriteCategories: [],
    recentViewedProductIds: [],
    recentViewedCategories: [],
    recentFavoritedProductIds: [],
    recentFavoritedCategories: [],
    recentChattedProductIds: [],
    recentChattedCategories: [],
    preferredRegion: parts[0] ?? "",
    preferredCity: parts[1] ?? "",
    preferredBarangay: parts[2] ?? "",
    updatedAt: new Date().toISOString(),
  };
}
