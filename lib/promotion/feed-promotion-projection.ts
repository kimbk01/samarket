/**
 * Feed Promotion projection — content cursor stays SSOT; promotion is overlay.
 * CONTRACT: docs/dibay-promotion-advertisement-product-contract.md
 *
 * LOCK (2026-08-07 red-team):
 * - NOT "unlimited page0 dump" — max `MAX_PAGE0_PROMOTED_PINS` pins on page 0.
 * - Surfaces: TRADE_HOME (all eligible) + TRADE_CATEGORY (posts matching category filter only).
 * - Ordering among pins: entitlement end_at DESC (freshest remaining window first).
 * - page>0: exclude active promoted ids (no duplicate re-entry).
 * - Ad slot count uses projected content rows (promoted+normal), not a separate blank lane.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { mapPostRowForHome } from "@/lib/posts/home-posts-query-server";

/** Cap page-0 pin count so paid boost does not bury the organic feed. */
export const MAX_PAGE0_PROMOTED_PINS = 3;

const INELIGIBLE_STATUS = new Set([
  "sold",
  "deleted",
  "hidden",
  "suspended",
  "blocked",
  "blinded",
]);

export type ActivePromotionEntitlement = {
  targetId: string;
  endAt: string;
  productId: string;
};

/** Sold/hidden/deleted/suspended must not stay boosted in feed. */
export function isPostEligibleForPromotionBoost(
  status: string | null | undefined
): boolean {
  const s = String(status ?? "active").trim().toLowerCase();
  if (!s || s === "null") return true;
  if (INELIGIBLE_STATUS.has(s)) return false;
  return s === "active";
}

export async function listActiveTradePromotionTargetIds(
  sb: SupabaseClient,
  nowIso = new Date().toISOString()
): Promise<ActivePromotionEntitlement[]> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("target_id, end_at, product_id, target_type, order_status, start_at")
    .eq("target_type", "product")
    .eq("order_status", "active")
    .lte("start_at", nowIso)
    .gte("end_at", nowIso)
    .order("end_at", { ascending: false })
    .limit(200);

  if (error || !Array.isArray(data)) return [];

  const out: ActivePromotionEntitlement[] = [];
  const seen = new Set<string>();
  for (const row of data as Record<string, unknown>[]) {
    const targetId = String(row.target_id ?? "").trim();
    if (!targetId || seen.has(targetId)) continue;
    seen.add(targetId);
    out.push({
      targetId,
      endAt: String(row.end_at ?? ""),
      productId: String(row.product_id ?? ""),
    });
  }
  return out;
}

/**
 * Page 0: prepend up to MAX_PAGE0_PROMOTED_PINS eligible promoted posts,
 * then append normal posts excluding those pinned ids (and all active promo ids
 * that were eligible but not pinned stay out of organic list on page0 only if
 * they were in the pin candidate set — they remain discoverable via category
 * browse / detail; they are still excluded from page>0 to avoid double-count).
 * Page >0: normal posts only, excluding all active promoted ids (no re-entry).
 */
export function projectTradeFeedWithPromotions(input: {
  pageIndex: number;
  normalPosts: PostWithMeta[];
  promotedPosts: PostWithMeta[];
  activePromotionIds: Set<string>;
  maxPage0Pins?: number;
}): { posts: PostWithMeta[]; promotedIdsOnPage: string[] } {
  const {
    pageIndex,
    normalPosts,
    promotedPosts,
    activePromotionIds,
    maxPage0Pins = MAX_PAGE0_PROMOTED_PINS,
  } = input;

  const eligiblePromoted = promotedPosts.filter((p) => {
    if (!activePromotionIds.has(p.id)) return false;
    return isPostEligibleForPromotionBoost(p.status);
  });

  if (pageIndex <= 0) {
    const pinned = eligiblePromoted.slice(0, Math.max(0, maxPage0Pins));
    const pinnedIds = new Set(pinned.map((p) => p.id));
    // Only strip pinned ids from organic rest (avoid duplicate). Overflow promos
    // may still appear in their organic rank with annotation when present.
    const rest = normalPosts.filter((p) => !pinnedIds.has(p.id));
    const merged = [...pinned, ...rest];
    const annotatedOnPage = new Set([
      ...pinned.map((p) => p.id),
      ...rest.filter((p) => activePromotionIds.has(p.id)).map((p) => p.id),
    ]);
    return {
      posts: merged,
      promotedIdsOnPage: [...annotatedOnPage],
    };
  }

  const rest = normalPosts.filter((p) => !activePromotionIds.has(p.id));
  return { posts: rest, promotedIdsOnPage: [] };
}

export async function loadPostsByIdsForPromotion(
  sb: SupabaseClient,
  ids: string[],
  categoryIdFilter: string[] | null
): Promise<PostWithMeta[]> {
  const unique = [...new Set(ids.map((x) => x.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await sb
    .from("posts")
    .select(
      "id, user_id, type, trade_category_id, title, price, status, view_count, thumbnail_url, images, region, city, created_at, updated_at, meta, is_free_share, is_price_offer"
    )
    .in("id", unique);

  if (error || !Array.isArray(data)) return [];

  let rows = data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );

  rows = rows.filter((p) => isPostEligibleForPromotionBoost(p.status));

  if (categoryIdFilter && categoryIdFilter.length > 0) {
    const allow = new Set(categoryIdFilter);
    rows = rows.filter((p) => {
      const cid = String(p.trade_category_id ?? p.category_id ?? "").trim();
      return cid && allow.has(cid);
    });
  }

  // Preserve entitlement order
  const order = new Map(unique.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  return rows;
}

export function annotatePromotedPosts(
  posts: PostWithMeta[],
  promotedIds: Set<string>
): PostWithMeta[] {
  return posts.map((p) => {
    if (!promotedIds.has(p.id)) return p;
    const meta =
      p.meta && typeof p.meta === "object" && !Array.isArray(p.meta)
        ? { ...(p.meta as Record<string, unknown>) }
        : {};
    return {
      ...p,
      meta: { ...meta, promotion_projection: "promoted_content" },
    };
  });
}

/**
 * Server-side Trade feed projection. Content page query unchanged;
 * promoted rows overlay on page 0 and are excluded from later pages.
 */
export async function applyTradeHomePromotionProjection(
  sb: SupabaseClient,
  input: {
    pageIndex: number;
    posts: PostWithMeta[];
    tradeCategoryIds: string[] | null;
  }
): Promise<{ posts: PostWithMeta[]; hasPromotionOverlay: boolean }> {
  try {
    const entitlements = await listActiveTradePromotionTargetIds(sb);
    if (entitlements.length === 0) {
      return { posts: input.posts, hasPromotionOverlay: false };
    }
    const activeIds = new Set(entitlements.map((e) => e.targetId));
    const promotedPosts =
      input.pageIndex <= 0
        ? await loadPostsByIdsForPromotion(
            sb,
            entitlements.map((e) => e.targetId),
            input.tradeCategoryIds
          )
        : [];
    const projected = projectTradeFeedWithPromotions({
      pageIndex: input.pageIndex,
      normalPosts: input.posts,
      promotedPosts,
      activePromotionIds: activeIds,
    });
    const annotated = annotatePromotedPosts(
      projected.posts,
      new Set(projected.promotedIdsOnPage)
    );
    return {
      posts: annotated,
      hasPromotionOverlay: projected.promotedIdsOnPage.length > 0,
    };
  } catch {
    return { posts: input.posts, hasPromotionOverlay: false };
  }
}
