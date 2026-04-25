/**
 * TRADE 상단 탭(전체·카테고리) — `getHomeChipCategories` 와 **동일 DB 쿼리**를 서버에서 1회 가져와
 * 클라이언트 2nd RTT "로딩…" 를 없앤다. `unstable_cache` 로 인스턴스·요청 당 DB 부담을 제한.
 */
import { unstable_cache } from "next/cache";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import type { CategoryWithSettings } from "./types";
import { queryTradeHomeRootCategories } from "./trade-home-root-query";

const CACHE_KEY = "home-trade-tab-categories-v1" as const;

export async function getHomeTradeChipCategoriesForServer(): Promise<CategoryWithSettings[]> {
  try {
    return await unstable_cache(
      async (): Promise<CategoryWithSettings[]> => {
        try {
          const sb = getSupabaseServer();
          const r = await queryTradeHomeRootCategories(sb);
          if (r.ok) return r.categories;
        } catch {
          /* 서비스 키 없는 로컬 */
        }
        return [];
      },
      [CACHE_KEY],
      { revalidate: 120, tags: ["home-trade-tab-categories"] }
    )();
  } catch {
    return [];
  }
}
