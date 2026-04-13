/**
 * 거래 메뉴(`/admin/menus/trade` 홈 칩) ↔ 카테고리 id 확장 ↔ `posts.trade_category_id` 필터.
 * - 루트 목록: `lib/categories/trade-home-root-query` 의 `fetchTradeHomeRootCategories`
 * - 루트별 확장: `lib/market/trade-category-subtree` 의 `fetchTradeCategoryDescendantNodes`
 *
 * **마켓 글 목록 쿼리 단일 소스**는 `GET /api/trade/feed` / `fetchTradeFeedPage` — `docs/trade-market-feed-contract.md`.
 *
 * 카테고리 트리 펼침은 **RLS 없이 전체 하위 id** 가 필요하므로, 가능하면 `SUPABASE_SERVICE_ROLE_KEY` 로 만든
 * 클라이언트를 쓴다(anon 만 있으면 `categories` 행이 잘려 마켓 탭에 글이 안 나올 수 있음).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function categoryTreeClient(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null
): SupabaseClient<any> {
  return tryCreateSupabaseServiceClient() ?? serviceSb ?? readSb;
}

/** 홈 `tradeMarketParent`·마켓 1차 메뉴 — 루트 id + 하위 전체(레거시 id 병합 포함) */
export async function expandTradeCategoryIdsForRoot(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null,
  parentId: string
): Promise<string[]> {
  const pid = parentId.trim();
  const qsb = categoryTreeClient(readSb, serviceSb);
  const descendants = await fetchTradeCategoryDescendantNodes(qsb, pid);
  const descIds = descendants.map((d) => d.id).filter(Boolean);
  return [...new Set([pid, ...descIds])];
}

/**
 * 홈 「전체」 탭(정책 A): `show_in_home_chips` 거래 루트들 각각을 펼친 id 들의 **합집합**.
 * 루트가 없으면 빈 배열(호출측에서 ‘필터 없음’으로 처리하지 말 것).
 */
export async function expandTradeCategoryIdsForAllConfiguredHomeRoots(
  readSb: SupabaseClient<any>,
  serviceSb: SupabaseClient<any> | null
): Promise<string[]> {
  const qsb = categoryTreeClient(readSb, serviceSb);
  const roots = await fetchTradeHomeRootCategories(qsb);
  if (roots.length === 0) return [];
  const union = new Set<string>();
  for (const r of roots) {
    const ids = await expandTradeCategoryIdsForRoot(readSb, serviceSb, r.id);
    for (const id of ids) union.add(id);
  }
  return [...union];
}
