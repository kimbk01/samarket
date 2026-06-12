/**
 * 31단계: 최근 본 상품 저장 (source, sectionKey, dedupe, 최대 개수 정책)
 */

import type { RecentViewedProduct, RecentViewSource } from "@/lib/types/recommendation";

const MAX_RECENT_VIEWED_PER_USER = 50;

const RECORDS: RecentViewedProduct[] = [
  {
    id: "rv-1",
    userId: "me",
    productId: "1",
    viewedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    source: "home",
    sectionKey: "recommended",
    dedupeKey: "me:1",
  },
  {
    id: "rv-2",
    userId: "me",
    productId: "3",
    viewedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    source: "recommendation",
    sectionKey: "recent_view_based",
    dedupeKey: "me:3",
  },
  {
    id: "rv-3",
    userId: "me",
    productId: "2",
    viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    source: "search",
    sectionKey: null,
    dedupeKey: "me:2",
  },
];

export function getRecentViewedProducts(
  userId: string,
  limit = 50
): RecentViewedProduct[] {
  return RECORDS.filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, limit);
}

export function getRecentViewedProductIds(userId: string, limit = 20): string[] {
  return getRecentViewedProducts(userId, limit).map((r) => r.productId);
}

/** 관리자: 전체 최근 본 목록 (모든 사용자) */
export function getAllRecentViewedProducts(limit = 200): RecentViewedProduct[] {
  return [...RECORDS]
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, limit);
}

function trimToMax(userId: string): void {
  const userRecords = RECORDS.filter((r) => r.userId === userId)
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
  if (userRecords.length <= MAX_RECENT_VIEWED_PER_USER) return;
  const toRemove = userRecords.slice(MAX_RECENT_VIEWED_PER_USER);
  toRemove.forEach((r) => {
    const idx = RECORDS.findIndex((x) => x.id === r.id);
    if (idx >= 0) RECORDS.splice(idx, 1);
  });
}

export function recordRecentView(
  userId: string,
  productId: string,
  source: RecentViewSource = "home",
  sectionKey: string | null = null
): void {
  const dedupeKey = `${userId}:${productId}`;
  const existingIdx = RECORDS.findIndex((r) => r.dedupeKey === dedupeKey);
  const now = new Date().toISOString();
  if (existingIdx >= 0) {
    RECORDS[existingIdx]!.viewedAt = now;
    RECORDS[existingIdx]!.source = source;
    RECORDS[existingIdx]!.sectionKey = sectionKey;
    const rec = RECORDS.splice(existingIdx, 1)[0]!;
    RECORDS.unshift(rec);
    return;
  }
  RECORDS.unshift({
    id: `rv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId,
    productId,
    viewedAt: now,
    source,
    sectionKey,
    dedupeKey,
  });
  trimToMax(userId);
}
