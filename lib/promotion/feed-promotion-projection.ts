/**
 * Feed Promotion projection — content cursor stays SSOT; promotion is overlay.
 * CONTRACT: docs/dibay-promotion-advertisement-product-contract.md
 *
 * LIST (no q):
 * - TRADE_HOME (전체) pool = domain=trade entitlements (category filter = HOME universe only).
 * - TRADE_CATEGORY pool = same entitlements whose post is in browse membership ids.
 * - Select ≤ MAX_PAGE0_PROMOTED_PINS with stable hash; interleave into organic page-1.
 * - Unselected active ids do not appear on LIST (page 0 or later).
 * - page>0: exclude all active promoted ids (no duplicate re-entry).
 *
 * CUT F SEARCH (`pinPromoted: false`) remains badge-only over CUT C rank.
 * DO NOT inject Feed Banner slots here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import { HOME_POSTS_PAGE_SIZE, mapPostRowForHome } from "@/lib/posts/home-posts-query-server";
import {
  TRADE_PROMOTION_PROJECTION,
  isPostEligibleForPromotionBoost,
} from "@/lib/promotion/trade-promotion-overlay";
import {
  interleavePromotedIntoOrganic,
  selectPromotedListingIds,
  tradePromotionCategoryKey,
  tradePromotionListSeed,
  type TradePromotionListSurface,
} from "@/lib/promotion/select-trade-promoted-listings";

export {
  TRADE_PROMOTION_PROJECTION,
  isPostEligibleForPromotionBoost,
  postHasTradePromotionOverlay,
} from "@/lib/promotion/trade-promotion-overlay";

/** Cap page-0 pin count so paid boost does not bury the organic feed. */
export const MAX_PAGE0_PROMOTED_PINS = 3;

/**
 * Request `page` is 1-based (`normalizePage`). LIST pin uses 0-based pageIndex.
 * page=1 → 0 (pin ≤3). page=2+ → ≥1 (no prepend).
 */
export function tradePromotionPageIndexFromRequestPage(page: number): number {
  const n = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.max(0, n - 1);
}

export type ActivePromotionEntitlement = {
  targetId: string;
  endAt: string;
  productId: string;
};

/** LIST selector window: active row AND start<=now AND end>=now. Clock starts at admin approve. */
export function isLiveTradePromotionEntitlement(input: {
  orderStatus: string;
  startAt: string;
  endAt: string;
  nowMs?: number;
}): boolean {
  if (String(input.orderStatus ?? "").toLowerCase() !== "active") return false;
  const now = input.nowMs ?? Date.now();
  const start = Date.parse(input.startAt);
  const end = Date.parse(input.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return start <= now && end >= now;
}

export async function listActiveTradePromotionTargetIds(
  sb: SupabaseClient,
  nowIso = new Date().toISOString()
): Promise<ActivePromotionEntitlement[]> {
  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("target_id, end_at, product_id, target_type, order_status, start_at")
    .eq("target_type", "product")
    .eq("domain", "trade")
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
    if (
      !isLiveTradePromotionEntitlement({
        orderStatus: String(row.order_status ?? ""),
        startAt: String(row.start_at ?? ""),
        endAt: String(row.end_at ?? ""),
        nowMs: Date.parse(nowIso),
      })
    ) {
      continue;
    }
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
 * Page 0: hash-select up to MAX_PAGE0_PROMOTED_PINS eligible promoted posts,
 * interleave into organic (not a top-3 block). Other active promo ids stay off LIST.
 * Page >0: organic only, excluding all active promoted ids.
 */
export function projectTradeFeedWithPromotions(input: {
  pageIndex: number;
  normalPosts: PostWithMeta[];
  promotedPosts: PostWithMeta[];
  activePromotionIds: Set<string>;
  maxPage0Pins?: number;
  seed?: string;
  /**
   * Organic page size SSOT (HOME_POSTS_PAGE_SIZE).
   * page=1 final length ≤ this: (organic minus all live promo ids, capped) + selected ≤3.
   */
  organicPageSize?: number;
}): { posts: PostWithMeta[]; promotedIdsOnPage: string[] } {
  const {
    pageIndex,
    normalPosts,
    promotedPosts,
    activePromotionIds,
    maxPage0Pins = MAX_PAGE0_PROMOTED_PINS,
    seed = "trade:list",
    organicPageSize,
  } = input;

  const eligiblePromoted = promotedPosts.filter((p) => {
    if (!activePromotionIds.has(p.id)) return false;
    return isPostEligibleForPromotionBoost(p.status, p.seller_listing_state);
  });

  if (pageIndex <= 0) {
    const selectedIds = selectPromotedListingIds(
      eligiblePromoted.map((p) => p.id),
      seed,
      maxPage0Pins
    );
    const byId = new Map(eligiblePromoted.map((p) => [p.id, p]));
    const selected = selectedIds
      .map((id) => byId.get(id))
      .filter((p): p is PostWithMeta => Boolean(p));
    const selectedSet = new Set(selected.map((p) => p.id));
    let rest = normalPosts.filter((p) => !activePromotionIds.has(p.id));
    if (organicPageSize != null && Number.isFinite(organicPageSize) && organicPageSize > 0) {
      const cap = Math.max(0, Math.floor(organicPageSize) - selected.length);
      rest = rest.slice(0, cap);
    }
    const merged = interleavePromotedIntoOrganic(rest, selected, seed);
    return {
      posts: merged,
      promotedIdsOnPage: [...selectedSet],
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
      "id, user_id, type, trade_category_id, title, price, status, seller_listing_state, view_count, thumbnail_url, images, region, city, trade_lgu_id, created_at, updated_at, meta, is_free_share, is_price_offer"
    )
    .in("id", unique);

  if (error || !Array.isArray(data)) return [];

  let rows = data.map((row) =>
    mapPostRowForHome(row && typeof row === "object" ? (row as Record<string, unknown>) : {})
  );

  rows = rows.filter((p) => isPostEligibleForPromotionBoost(p.status, p.seller_listing_state));

  // Same membership set as LIST `tradeCategoryIds` (ROOT+TOPIC expand / HOME union).
  // Not `eq(trade_category_id, browseRoot)` — child listing ids must stay in ROOT browse.
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
      meta: { ...meta, promotion_projection: TRADE_PROMOTION_PROJECTION },
    };
  });
}

/**
 * CUT F SEARCH — badge only. Do not prepend pins or drop promoted ids.
 * CUT C T1–T4 order stays the candidate/rank authority.
 */
export function overlayTradePromotionBadges(input: {
  posts: PostWithMeta[];
  activePromotionIds: Set<string>;
}): { posts: PostWithMeta[]; promotedIdsOnPage: string[] } {
  const promotedIdsOnPage = input.posts
    .filter(
      (p) =>
        input.activePromotionIds.has(p.id) &&
        isPostEligibleForPromotionBoost(p.status, p.seller_listing_state)
    )
    .map((p) => p.id);
  return {
    posts: annotatePromotedPosts(input.posts, new Set(promotedIdsOnPage)),
    promotedIdsOnPage,
  };
}

/**
 * Server-side Trade feed projection. Content page query unchanged;
 * LIST/CATEGORY browse: promoted rows overlay on page 0 and are excluded
 * from later pages. SEARCH (`pinPromoted: false`): badge only, rank unchanged.
 */
export async function applyTradeHomePromotionProjection(
  sb: SupabaseClient,
  input: {
    pageIndex: number;
    posts: PostWithMeta[];
    tradeCategoryIds: string[] | null;
    /** Default true = LIST mix. False = SEARCH overlay (CUT F). */
    pinPromoted?: boolean;
    /** HOME 전체 vs 해당 카테고리 browse. Default home. */
    promotionSurface?: TradePromotionListSurface;
    nowMs?: number;
  }
): Promise<{ posts: PostWithMeta[]; hasPromotionOverlay: boolean }> {
  try {
    const entitlements = await listActiveTradePromotionTargetIds(sb);
    if (entitlements.length === 0) {
      return { posts: input.posts, hasPromotionOverlay: false };
    }
    const activeIds = new Set(entitlements.map((e) => e.targetId));
    if (input.pinPromoted === false) {
      const overlaid = overlayTradePromotionBadges({
        posts: input.posts,
        activePromotionIds: activeIds,
      });
      return {
        posts: overlaid.posts,
        hasPromotionOverlay: overlaid.promotedIdsOnPage.length > 0,
      };
    }
    const promotedPosts =
      input.pageIndex <= 0
        ? await loadPostsByIdsForPromotion(
            sb,
            entitlements.map((e) => e.targetId),
            input.tradeCategoryIds
          )
        : [];
    const surface: TradePromotionListSurface =
      input.promotionSurface === "category" ? "category" : "home";
    const seed = tradePromotionListSeed({
      surface,
      categoryKey:
        surface === "category" ? tradePromotionCategoryKey(input.tradeCategoryIds) : "",
      nowMs: input.nowMs,
    });
    const projected = projectTradeFeedWithPromotions({
      pageIndex: input.pageIndex,
      normalPosts: input.posts,
      promotedPosts,
      activePromotionIds: activeIds,
      seed,
      organicPageSize: HOME_POSTS_PAGE_SIZE,
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
