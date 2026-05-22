import type { SupabaseClient } from "@supabase/supabase-js";

/** GET /api/stores/browse - category/topics slice (10min TTL, key primary+sub) */
export const STORES_BROWSE_TAXONOMY_CACHE_TTL_MS = 10 * 60_000;

export type BrowseTaxonomyTopic = {
  id: string;
  slug: string;
  name: string;
};

export type BrowseTaxonomySlice = {
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  primaryAliases: string[];
  topicList: BrowseTaxonomyTopic[];
  resolvedTopicId: string | null;
  selectedTopicMeta: { slug: string; name: string } | null;
  unknownPrimary: boolean;
  unknownTopic: boolean;
};

type CacheEntry = { expiresAt: number; slice: BrowseTaxonomySlice };

const cache = new Map<string, CacheEntry>();

type TopicRow = {
  id: string;
  slug: string;
  name: string;
  sort_order: number | null;
  is_active?: boolean;
};

export function browseTaxonomyCacheKey(primary: string, sub: string): string {
  return `${primary.trim().toLowerCase()}\0${sub.trim().toLowerCase()}`;
}

export function peekBrowseTaxonomySlice(cacheKey: string): BrowseTaxonomySlice | null {
  const row = cache.get(cacheKey);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) cache.delete(cacheKey);
    return null;
  }
  return row.slice;
}

export function setBrowseTaxonomySlice(cacheKey: string, slice: BrowseTaxonomySlice): void {
  cache.set(cacheKey, { expiresAt: Date.now() + STORES_BROWSE_TAXONOMY_CACHE_TTL_MS, slice });
  if (cache.size > 120) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt <= now) cache.delete(k);
    }
  }
}

function dedupeTopics(topics: TopicRow[]): BrowseTaxonomyTopic[] {
  const best = new Map<string, BrowseTaxonomyTopic & { sort_order: number }>();
  for (const t of topics) {
    const slugKey = String(t.slug ?? "").trim().toLowerCase();
    if (!slugKey) continue;
    const so = t.sort_order ?? 0;
    const prev = best.get(slugKey);
    if (!prev || so < prev.sort_order) {
      best.set(slugKey, {
        id: String(t.id),
        slug: String(t.slug).trim(),
        name: String(t.name ?? "").trim(),
        sort_order: so,
      });
    }
  }
  return [...best.values()]
    .sort((a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug))
    .map(({ sort_order: _so, ...rest }) => rest);
}

/**
 * Single taxonomy fetch (category + embedded topics), then cache.
 * @returns cacheHit - in-memory TTL hit
 */
export async function loadBrowseTaxonomySlice(
  sb: SupabaseClient,
  primary: string,
  subRaw: string,
  wantsAllSubs: boolean,
): Promise<{ slice: BrowseTaxonomySlice; cacheHit: boolean }> {
  const subKey = wantsAllSubs ? "all" : subRaw;
  const cacheKey = browseTaxonomyCacheKey(primary, subKey);
  const cached = peekBrowseTaxonomySlice(cacheKey);
  if (cached) {
    return { slice: cached, cacheHit: true };
  }

  const emptyUnknownPrimary: BrowseTaxonomySlice = {
    categoryId: "",
    categorySlug: primary,
    categoryName: primary,
    primaryAliases: [primary],
    topicList: [],
    resolvedTopicId: null,
    selectedTopicMeta: null,
    unknownPrimary: true,
    unknownTopic: false,
  };

  const { data: catBundle, error: catErr } = await sb
    .from("store_categories")
    .select("id, slug, name, store_topics ( id, slug, name, sort_order, is_active )")
    .eq("slug", primary)
    .eq("is_active", true)
    .maybeSingle();

  if (catErr) {
    throw new Error(catErr.message);
  }

  if (!catBundle?.id) {
    setBrowseTaxonomySlice(cacheKey, emptyUnknownPrimary);
    return { slice: emptyUnknownPrimary, cacheHit: false };
  }

  const categoryName =
    typeof catBundle.name === "string" && catBundle.name.trim() ? catBundle.name.trim() : primary;
  const primaryAliases = [primary, catBundle.name ?? ""].map((s) => s.trim()).filter(Boolean);

  const topicsRaw = (
    (catBundle as { store_topics?: TopicRow[] | null }).store_topics ?? []
  ).filter((t) => t.is_active !== false);

  const topicList = dedupeTopics(topicsRaw);

  let resolvedTopicId: string | null = null;
  let selectedTopicMeta: { slug: string; name: string } | null = null;
  let unknownTopic = false;

  if (!wantsAllSubs) {
    const hit = topicList.find((t) => t.slug.trim().toLowerCase() === subRaw);
    if (hit) {
      resolvedTopicId = hit.id;
      selectedTopicMeta = { slug: hit.slug, name: hit.name };
    } else {
      unknownTopic = true;
    }
  }

  const slice: BrowseTaxonomySlice = {
    categoryId: String(catBundle.id),
    categorySlug: String(catBundle.slug ?? primary).trim().toLowerCase(),
    categoryName,
    primaryAliases,
    topicList,
    resolvedTopicId,
    selectedTopicMeta,
    unknownPrimary: false,
    unknownTopic,
  };

  setBrowseTaxonomySlice(cacheKey, slice);
  return { slice, cacheHit: false };
}
