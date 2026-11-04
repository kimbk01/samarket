import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";

/**
 * Trade「더 알리기」LIST selection — not Feed Banner, not SEARCH rank.
 * HOME (전체) and CATEGORY browse share this selector; pool is filtered by caller.
 * DO NOT use Math.random(). DO NOT call selectCampaignsForPlacement.
 */
export type TradePromotionListSurface = "home" | "category";

/**
 * 재감사 R2 (Owner 2026-11-03 「여러 명이 상위노출을 하면 최신순으로 올라가는 부분」): 결제 시각(start_at)이 최근인
 * 순서로 앞에서 `max` 개(기본 `PROMOTED_TOP_PINS_MAX` = 1 · Owner 2026-11-05). 호출처가 후보를 start_at 내림차순으로 넘긴다(`listActiveTradePromotionTargetIds`).
 * 연장은 start_at 을 바꾸지 않으므로 자리도 그대로다(D-1). 시간 단위 회전 없음.
 */
export function selectPromotedListingIds(candidateIdsLatestFirst: string[], max = PROMOTED_TOP_PINS_MAX): string[] {
  const unique = [...new Set(candidateIdsLatestFirst.map((id) => id.trim()).filter(Boolean))];
  return unique.slice(0, Math.max(0, max));
}

/**
 * 고른 상위노출 글을 1페이지 **위쪽**에 둔다 — 광고 감사 P-1 (Owner 승인 판매자 안내 「거래 목록 위쪽」,
 * 계약 §7b 「page-0 priority pins」). 첫 칸은 일반 글 그대로(첫 화면 표시), 2번째 칸에 고른 글.
 * 어떤 글을 고를지는 `selectPromotedListingIds` 가 정한다(최근 결제 순 · 자리 순서 = 고른 순서).
 */
export function interleavePromotedIntoOrganic<T extends { id: string }>(
  organic: T[],
  promoted: T[]
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
