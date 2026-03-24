/**
 * 31단계: 사용자 행동 인사이트 (이벤트 기반 집계)
 */

import type { UserBehaviorInsight } from "@/lib/types/recommendation";
import { getBehaviorEvents } from "./mock-user-behavior-events";

export function getUserBehaviorInsights(userId?: string): UserBehaviorInsight[] {
  const events = getBehaviorEvents(userId ? { userId } : {});
  const byUser = new Map<string, typeof events>();
  for (const e of events) {
    if (!byUser.has(e.userId)) byUser.set(e.userId, []);
    byUser.get(e.userId)!.push(e);
  }
  const result: UserBehaviorInsight[] = [];
  for (const [uid, list] of byUser) {
    const categories = new Map<string, number>();
    const regions = new Map<string, number>();
    let totalViews = 0;
    let totalFavorites = 0;
    let totalChatsStarted = 0;
    let lastActiveAt = "";
    for (const e of list) {
      if (e.eventType === "product_view") totalViews++;
      if (e.eventType === "favorite_add" || e.eventType === "favorite_remove") totalFavorites++;
      if (e.eventType === "chat_start") totalChatsStarted++;
      if (e.category) categories.set(e.category, (categories.get(e.category) ?? 0) + 1);
      if (e.region) {
        const r = [e.region, e.city, e.barangay].filter(Boolean).join(" · ");
        regions.set(r, (regions.get(r) ?? 0) + 1);
      }
      if (e.createdAt > lastActiveAt) lastActiveAt = e.createdAt;
    }
    const topCategories = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([c]) => c);
    const topRegions = [...regions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([r]) => r);
    result.push({
      userId: uid,
      topCategories,
      topRegions,
      totalViews,
      totalFavorites,
      totalChatsStarted,
      lastActiveAt: lastActiveAt || new Date(0).toISOString(),
    });
  }
  return result.sort(
    (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );
}
