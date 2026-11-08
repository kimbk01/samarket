import { unstable_cache } from "next/cache";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { HOME_LAYOUT_SERVER_CACHE_TAG } from "@/lib/home/home-layout-contract";
import type { HomeCatalog } from "@/lib/home/home-catalog-types";

/**
 * 홈이 쓰는 분류 목록 (서버 캐시 5분) — 앱 홈·어드민 「홈 구성」 같은 값.
 * - 배달 업종: `store_categories` (업종 그림 = 어드민 「매장 업종 관리」에 올린 그림 그대로)
 * - 거래 카테고리: `categories` type=trade 1차 (서비스 카드 「거래」 자동 설명 · 거래 칸 필터)
 * - 정보교환 주제: `community_topics` (교민 이야기 칸 필터)
 */
export async function loadHomeCatalogFromStore(): Promise<HomeCatalog> {
  const sb = tryGetSupabaseForStores();
  if (!sb) return { storeCategories: [], tradeCategories: [], communityTopics: [] };
  const [sc, tc, ct] = await Promise.all([
    sb
      .from("store_categories")
      .select("slug, name, name_en, image_url, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    sb
      .from("categories")
      .select("id, slug, name, name_en, sort_order")
      .eq("type", "trade")
      .eq("is_active", true)
      .is("parent_id", null)
      .order("sort_order", { ascending: true }),
    sb
      .from("community_topics")
      .select("slug, name, name_en, sort_order")
      .eq("is_active", true)
      .eq("is_visible", true)
      .order("sort_order", { ascending: true }),
  ]);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    storeCategories: ((sc.data ?? []) as Record<string, unknown>[])
      .filter((r) => str(r.slug))
      .map((r) => ({
        slug: str(r.slug),
        nameKo: str(r.name),
        nameEn: str(r.name_en),
        imageUrl: str(r.image_url) || null,
      })),
    tradeCategories: ((tc.data ?? []) as Record<string, unknown>[])
      .filter((r) => str(r.id))
      .map((r) => ({ id: str(r.id), slug: str(r.slug), nameKo: str(r.name), nameEn: str(r.name_en) })),
    communityTopics: ((ct.data ?? []) as Record<string, unknown>[])
      .filter((r) => str(r.slug))
      .map((r) => ({ slug: str(r.slug), nameKo: str(r.name), nameEn: str(r.name_en) })),
  };
}

const loadHomeCatalogCachedInternal = unstable_cache(
  async (): Promise<HomeCatalog> => loadHomeCatalogFromStore(),
  ["home-catalog:server:v1"],
  { revalidate: 300, tags: [HOME_LAYOUT_SERVER_CACHE_TAG] }
);

export async function loadHomeCatalogServerCached(): Promise<HomeCatalog> {
  try {
    return await loadHomeCatalogCachedInternal();
  } catch {
    return { storeCategories: [], tradeCategories: [], communityTopics: [] };
  }
}
