/**
 * 2026-10-27 Owner 목록 계약 — 물품(주제)을 골라도 **전체가 나오고**, 고른 물품이 앞으로 온다.
 * 해당 물품(하위 주제) → 유사 물품(같은 상위 주제의 나머지) → 전체 물품.
 *
 * `/api/philife/posts`(화면 표시) · `/api/trade/feed` · 마켓 bootstrap 첫 페이지가 같은 구간을 쓰도록 한 곳에서 계산한다.
 * 순서 조립은 `resolveHomePostsPayload` 의 물품 구간(`buildSoftCategorySegments`)이 한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  expandTradeCategoryIdsForAllConfiguredHomeRoots,
  expandTradeCategoryIdsForRoot,
} from "@/lib/trade/trade-market-catalog";

export type TradeSoftCategoryPriority = {
  /** 목록 전체 대상 — HOME 거래 합집합(설정 시) 또는 null(거래 전체) */
  universeTradeCategoryIds: string[] | null;
  /** 고른 상위 주제 + 하위 전체 */
  rootTradeCategoryIds: string[];
  /** 고른 하위 주제(트리). 없으면 [] */
  topicTradeCategoryIds: string[];
};

/** HOME 「전체」 목록이 설정된 거래 루트 합집합만 대상으로 하는지 (`HOME_POSTS_CONFIGURED_TRADE_UNION`) */
export function isConfiguredTradeUnionEnabledForHomeAll(): boolean {
  const v = (process.env.HOME_POSTS_CONFIGURED_TRADE_UNION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function resolveTradeListUniverseIds(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null
): Promise<string[] | null> {
  if (!isConfiguredTradeUnionEnabledForHomeAll()) return null;
  const union = await expandTradeCategoryIdsForAllConfiguredHomeRoots(readSb, serviceSb);
  return union.length > 0 ? union : null;
}

/**
 * 한 상위 주제(`parentId`) 선택 — `membershipIds` 는 기존 `computeMarketFilterIds` 결과
 * (하위 주제를 골랐으면 그 트리, 아니면 상위 주제 전체).
 */
export async function resolveTradeSoftCategoryPriorityForRoot(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  parentId: string,
  membershipIds: string[],
  topicParam: string
): Promise<TradeSoftCategoryPriority> {
  const rootIds = await expandTradeCategoryIdsForRoot(readSb, serviceSb, parentId);
  const topicSelected = Boolean(topicParam.trim());
  return {
    universeTradeCategoryIds: await resolveTradeListUniverseIds(readSb, serviceSb),
    rootTradeCategoryIds: [...new Set([...rootIds, ...membershipIds])],
    topicTradeCategoryIds: topicSelected ? membershipIds : [],
  };
}
