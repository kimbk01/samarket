/**
 * 30단계: 최근 본 상품 mock — 31단계 저장소 재사용
 */

import {
  getRecentViewedProductIds as getIds,
  recordRecentView,
} from "@/lib/recommendation/mock-recent-viewed-products";

export function getRecentViewedProductIds(userId: string, limit = 20): string[] {
  return getIds(userId, limit);
}

export function recordView(userId: string, productId: string): void {
  recordRecentView(userId, productId, "home", null);
}
