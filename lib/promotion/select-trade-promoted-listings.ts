/**
 * Trade「더 알리기」LIST selection — not Feed Banner, not SEARCH rank.
 * HOME (전체) and CATEGORY browse share this selector; pool is filtered by caller.
 * DO NOT use Math.random(). DO NOT call selectCampaignsForPlacement.
 */
import { feedAdStableHash } from "@/lib/ads/feed-ad-slot-policy";

export type TradePromotionListSurface = "home" | "category";

export function tradePromotionListSeed(input: {
  surface: TradePromotionListSurface;
  categoryKey?: string;
  nowMs?: number;
}): string {
  const hourBucket = Math.floor((input.nowMs ?? Date.now()) / 3_600_000);
  if (input.surface === "category") {
    const cat = (input.categoryKey ?? "").trim() || "none";
    return `trade:category|${cat}|${hourBucket}`;
  }
  return `trade:home|${hourBucket}`;
}

export function tradePromotionCategoryKey(categoryIds: string[] | null): string {
  if (!categoryIds || categoryIds.length === 0) return "";
  return [...new Set(categoryIds.map((id) => id.trim()).filter(Boolean))].sort().join(",");
}

/** Stable pick of up to `max` distinct ids. Pool order is lexicographic, not end_at. */
export function selectPromotedListingIds(
  candidateIds: string[],
  seed: string,
  max = 3
): string[] {
  const unique = [
    ...new Set(candidateIds.map((id) => id.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const cap = Math.max(0, Math.min(max, unique.length));
  if (cap === 0) return [];

  const picked: string[] = [];
  const used = new Set<string>();
  for (let i = 0; i < cap; i += 1) {
    const start = unique.length === 0 ? 0 : feedAdStableHash(`${seed}|pick|${i}`) % unique.length;
    let chosen: string | null = null;
    for (let step = 0; step < unique.length; step += 1) {
      const cand = unique[(start + step) % unique.length]!;
      if (used.has(cand)) continue;
      chosen = cand;
      break;
    }
    if (!chosen) break;
    used.add(chosen);
    picked.push(chosen);
  }
  return picked;
}

/**
 * 고른 상위노출 글을 1페이지 **위쪽**에 둔다 — 광고 감사 P-1 (Owner 승인 판매자 안내 「거래 목록 위쪽」,
 * 계약 §7b 「page-0 priority pins」). 첫 칸은 일반 글 그대로(첫 화면 표시), 2번째 칸부터 고른 순서대로.
 * 어떤 글을 고를지는 `selectPromotedListingIds` 의 시간 단위 회전이 정한다(자리 순서 = 고른 순서).
 */
export function interleavePromotedIntoOrganic<T extends { id: string }>(
  organic: T[],
  promoted: T[],
  _seed?: string
): T[] {
  if (promoted.length === 0) return organic;
  const seenPromo = new Set<string>();
  const uniquePromo: T[] = [];
  for (const row of promoted) {
    const id = row.id.trim();
    if (!id || seenPromo.has(id)) continue;
    seenPromo.add(id);
    uniquePromo.push(row);
  }
  const rest = organic.filter((p) => !seenPromo.has(p.id));
  const minIdx = rest.length > 0 ? 1 : 0;
  return [...rest.slice(0, minIdx), ...uniquePromo, ...rest.slice(minIdx)];
}
