/**
 * Feed Promotion projection — content cursor stays SSOT; promotion is overlay.
 * CONTRACT: docs/dibay-promotion-advertisement-product-contract.md
 *
 * LIST (no q):
 * - TRADE_HOME (전체) pool = domain=trade entitlements (category filter = HOME universe only).
 * - TRADE_CATEGORY pool = same entitlements whose post is in browse membership ids.
 * - Select ≤ MAX_PAGE0_PROMOTED_PINS **latest start_at first** (재감사 R2 · Owner 「최신순」); pin at top of page-1.
 * - 재감사 R2 D-2: 끼우지 못한 홍보 글(2번째 결제부터·뒤 페이지)도 일반 자리에서 「광고」 표시를 단다.
 * - Owner 2026-11-05: 끼우기에는 지역·거리 조건이 없다(예전 P-3 지역 구간 폐지). 일반 목록의 지역 정렬·필터는 그대로.
 * - 광고 감사 P-2 (Owner 승인 2026-11-03): 뽑히지 않은 홍보 글은 일반 글로 제자리에 남는다.
 *   1페이지: 끼운 id 만 일반 목록에서 뺀다. 이후 페이지: 일반 목록 그대로 — 1페이지에 끼운 글이
 *   뒤 페이지에 다시 오면 목록 화면이 붙일 때 id 로 거른다(`HomeProductList`·`PostListByCategory`).
 *   서버가 매 시간 바뀌는 선택을 뒤 페이지에서 다시 계산하지 않으므로 시간 경계에서 글이 빠지지 않는다.
 * - 광고 감사 P-3: 판매완료 탭에서는 끼우지 않고, 가격 범위가 있으면 범위 안 글만 끼운다.
 *
 * CUT F SEARCH (`pinPromoted: false`) remains badge-only over CUT C rank.
 * DO NOT inject Feed Banner slots here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  postMatchesCompositionFilterClauses,
  type CompositionFilterClause,
} from "@/lib/trade/category-form/composition-filter-query";
import { HOME_POSTS_PAGE_SIZE, mapPostRowForHome } from "@/lib/posts/home-posts-query-server";
import {
  TRADE_PROMOTION_PROJECTION,
  isPostEligibleForPromotionBoost,
} from "@/lib/promotion/trade-promotion-overlay";
import {
  interleavePromotedIntoOrganic,
  selectPromotedListingIds,
  type TradePromotionListSurface,
} from "@/lib/promotion/select-trade-promoted-listings";

export {
  TRADE_PROMOTION_PROJECTION,
  isPostEligibleForPromotionBoost,
  postHasTradePromotionOverlay,
} from "@/lib/promotion/trade-promotion-overlay";
import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";

/** Cap page-0 pin count so paid boost does not bury the organic feed. */
export const MAX_PAGE0_PROMOTED_PINS = PROMOTED_TOP_PINS_MAX;

/**
 * Request `page` is 1-based (`normalizePage`). LIST pin uses 0-based pageIndex.
 * page=1 → 0 (pin ≤ MAX_PAGE0_PROMOTED_PINS). page=2+ → ≥1 (no prepend).
 */
export function tradePromotionPageIndexFromRequestPage(page: number): number {
  const n = Number.isFinite(page) ? Math.floor(page) : 1;
  return Math.max(0, n - 1);
}

export type ActivePromotionEntitlement = {
  targetId: string;
  startAt: string;
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
    // 재감사 R2: 최근 결제(start_at) 순 — 끼우는 순서의 기준. 연장은 start_at 을 바꾸지 않는다(D-1).
    .order("start_at", { ascending: false })
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
      startAt: String(row.start_at ?? ""),
      endAt: String(row.end_at ?? ""),
      productId: String(row.product_id ?? ""),
    });
  }
  return out;
}

/** 목록 필터 중 홍보 끼우기에 같이 적용하는 조건 (광고 감사 P-3) */
export type TradePromotionPinFilter = {
  tradeState?: "all" | "active" | "sold";
  priceMin?: number;
  priceMax?: number;
  /**
   * 재감사 R3 (P-3): 목록의 품목 옵션 조건. 있으면 옵션이 맞는 상위노출 글만 끼운다(목록은 「맞음 → 안 맞음」 순서라,
   * 안 맞는 글을 맨 위에 끼우면 맞음 구간에 섞였다). 안 맞는 글은 일반 자리에 「광고」 표시로 남는다.
   */
  compositionFilters?: CompositionFilterClause[] | null;
};

/** 판매완료 탭은 끼우지 않는다 — 판매중 홍보 글은 일반 글로 「판매중」 구간에 남는다 */
export function tradePromotionPinsAllowed(filter: TradePromotionPinFilter | null | undefined): boolean {
  return filter?.tradeState !== "sold";
}

/** 가격 범위가 있으면 범위 안 글만 (가격 없는 글은 목록과 같이 범위 밖) */
export function tradePromotionPinMatchesFilter(
  post: Pick<PostWithMeta, "price">,
  filter: TradePromotionPinFilter | null | undefined
): boolean {
  const min = filter?.priceMin;
  const max = filter?.priceMax;
  if (min == null && max == null) return true;
  const price = typeof post.price === "number" && Number.isFinite(post.price) ? post.price : null;
  if (price == null) return false;
  if (min != null && price < min) return false;
  if (max != null && price > max) return false;
  return true;
}

/**
 * Page 0: 최근 결제 순으로 MAX_PAGE0_PROMOTED_PINS 개까지 1페이지 위쪽에 끼운다.
 * `promotedPosts` 는 start_at 내림차순(`loadPostsByIdsForPromotion` 이 권리 순서 유지).
 * 1페이지에 끼운 id 만 일반 목록에서 뺀다. 이후 페이지는 일반 목록 그대로.
 * 뽑히지 않은 홍보 글은 일반 글로 제자리에 나온다.
 */
export function projectTradeFeedWithPromotions(input: {
  pageIndex: number;
  normalPosts: PostWithMeta[];
  promotedPosts: PostWithMeta[];
  activePromotionIds: Set<string>;
  maxPage0Pins?: number;
  /**
   * Organic page size SSOT (HOME_POSTS_PAGE_SIZE).
   * page=1 final length ≤ this: (organic minus pinned ids, capped) + selected ≤ MAX_PAGE0_PROMOTED_PINS.
   */
  organicPageSize?: number;
  pinFilter?: TradePromotionPinFilter | null;
}): { posts: PostWithMeta[]; promotedIdsOnPage: string[] } {
  const {
    pageIndex,
    normalPosts,
    promotedPosts,
    activePromotionIds,
    maxPage0Pins = MAX_PAGE0_PROMOTED_PINS,
    organicPageSize,
    pinFilter,
  } = input;

  const eligiblePromoted = tradePromotionPinsAllowed(pinFilter)
    ? promotedPosts.filter((p) => {
        if (!activePromotionIds.has(p.id)) return false;
        if (!isPostEligibleForPromotionBoost(p.status, p.seller_listing_state)) return false;
        if (!postMatchesCompositionFilterClauses(p as unknown as Record<string, unknown>, pinFilter?.compositionFilters)) {
          return false;
        }
        return tradePromotionPinMatchesFilter(p, pinFilter);
      })
    : [];

  if (pageIndex <= 0) {
    // Owner 2026-11-05 「광고 지역 제한 전면 해제」: 보는 회원의 지역·거리와 상관없이 같은 글을 끼운다
    const selectedIds = selectPromotedListingIds(
      eligiblePromoted.map((p) => p.id),
      maxPage0Pins
    );
    const byId = new Map(eligiblePromoted.map((p) => [p.id, p]));
    const selected = selectedIds
      .map((id) => byId.get(id))
      .filter((p): p is PostWithMeta => Boolean(p));
    const selectedSet = new Set(selected.map((p) => p.id));
    let rest = normalPosts.filter((p) => !selectedSet.has(p.id));
    if (organicPageSize != null && Number.isFinite(organicPageSize) && organicPageSize > 0) {
      const cap = Math.max(0, Math.floor(organicPageSize) - selected.length);
      rest = rest.slice(0, cap);
    }
    /**
     * 재감사: 끼운 홍보 글은 목록 함수의 안내 줄 키(`list_section`)가 없어, 바로 뒤 일반 글에서 구간이 바뀌어도
     * 안내 줄이 빠졌다(앞 글 키가 없으면 줄을 그리지 않음). 홍보 글은 바로 앞(첫 칸) 일반 글과 같은 구간 키를 준다.
     */
    const anchorSection = rest[0]?.list_section;
    const selectedWithSection =
      anchorSection == null ? selected : selected.map((p) => ({ ...p, list_section: anchorSection }));
    const merged = interleavePromotedIntoOrganic(rest, selectedWithSection);
    return {
      posts: merged,
      promotedIdsOnPage: [...selectedSet],
    };
  }

  return { posts: normalPosts, promotedIdsOnPage: [] };
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
      "id, user_id, type, trade_category_id, title, price, status, seller_listing_state, view_count, thumbnail_url, images, region, city, trade_lgu_id, created_at, updated_at, meta, is_free_share, is_price_offer, moderation_state, owner_state, is_deleted"
    )
    .in("id", unique);

  if (error || !Array.isArray(data)) return [];

  /**
   * 거래 C L-3: 일반 목록(`trade_list_page`)과 같은 공개 자격 — 거래 글(trade_category_id 있음)·관리자 숨김/삭제 아님·
   * 판매자 숨김/삭제 아님·삭제 표시 아님. 홍보 결제가 남아 있어도 공개 자격이 없으면 끼워 넣지 않는다.
   */
  const publicRows = (data as Record<string, unknown>[]).filter((row) => {
    if (!row || typeof row !== "object") return false;
    if (!String(row.trade_category_id ?? "").trim()) return false;
    if (String(row.moderation_state ?? "visible") !== "visible") return false;
    if (String(row.owner_state ?? "none") !== "none") return false;
    if (row.is_deleted === true) return false;
    return true;
  });

  let rows = publicRows.map((row) =>
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
 * LIST/CATEGORY browse: 1페이지에만 홍보 글을 끼운다. 이후 페이지는 일반 목록 그대로(화면이 id 중복을 거름).
 * SEARCH (`pinPromoted: false`): badge only, rank unchanged.
 */
export async function applyTradeHomePromotionProjection(
  sb: SupabaseClient,
  input: {
    pageIndex: number;
    posts: PostWithMeta[];
    tradeCategoryIds: string[] | null;
    /** Default true = LIST mix. False = SEARCH overlay (CUT F). */
    pinPromoted?: boolean;
    /** HOME 전체 vs 해당 카테고리 browse. 후보 범위는 `tradeCategoryIds` 가 정한다(재감사 R2 이후 순서에는 영향 없음). */
    promotionSurface?: TradePromotionListSurface;
    /** 목록과 같은 판매상태·가격 조건 (광고 감사 P-3) */
    pinFilter?: TradePromotionPinFilter | null;
  }
): Promise<{ posts: PostWithMeta[]; hasPromotionOverlay: boolean; promotedIdsOnPage: string[] }> {
  try {
    const entitlements = await listActiveTradePromotionTargetIds(sb);
    if (entitlements.length === 0) {
      return { posts: input.posts, hasPromotionOverlay: false, promotedIdsOnPage: [] };
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
        /** 찾기(배지만): 순위는 그대로라 다음 페이지 기준에 영향 없음 */
        promotedIdsOnPage: [],
      };
    }
    const promotedPosts =
      input.pageIndex <= 0 && tradePromotionPinsAllowed(input.pinFilter)
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
      organicPageSize: HOME_POSTS_PAGE_SIZE,
      pinFilter: input.pinFilter,
    });
    /**
     * 재감사 R2 D-2: 끼운 글 + 일반 자리에 나온 홍보 글(2번째 결제부터·뒤 페이지) 모두 「광고」 표시.
     * 다음 페이지 기준(`promotedIdsOnPage`)은 끼운 글만 — 일반 자리 글은 순위가 그대로라 기준에 넣지 않는다.
     */
    const badged = overlayTradePromotionBadges({
      posts: projected.posts,
      activePromotionIds: activeIds,
    });
    return {
      posts: badged.posts,
      hasPromotionOverlay: badged.promotedIdsOnPage.length > 0,
      promotedIdsOnPage: [...projected.promotedIdsOnPage],
    };
  } catch {
    return { posts: input.posts, hasPromotionOverlay: false, promotedIdsOnPage: [] };
  }
}
