/**
 * 거래 게시물 관리자 조회 SSOT (설계 v2 §C-2 · §E-5 · §F-1-0).
 * 목록 · 탭 건수 · 대시보드 지표가 모두 이 파일의 같은 조건 함수를 쓴다 → 숫자와 목록이 일치한다.
 *
 * - 범위 = posts 전체 행 (type 조건 없음 — D-01). 서비스 롤로 `posts` 를 직접 읽는다 (노출 컬럼 포함).
 * - 「앱 노출 중」 = 사용자 앱 목록과 같은 필터 함수 (`buildTradePostsStatusAndTradeCategoryOnlyAndFilter`
 *   + 활성 거래 카테고리) 를 그대로 쓴다.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTradePostsStatusAndTradeCategoryOnlyAndFilter } from "@/lib/posts/trade-posts-category-filter";
import { applyPostgrestAndGroup } from "@/lib/posts/apply-postgrest-and-group";
import {
  escapeAdminIlike,
  sanitizeAdminListSearch,
  isAdminListUuid,
  quotePostgrestOrValue,
} from "@/lib/admin/pagination/parse-admin-list-page";
import type { TradePostSort, TradePostTab } from "@/lib/admin/trade-admin/trade-post-tabs";

export const TRADE_ADMIN_OPEN_REPORT_STATUSES = ["pending", "reviewing"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
type Q = any;

export type TradePostsFilter = {
  q?: string;
  sellerId?: string | null;
  categoryId?: string | null;
  tradeType?: "product" | "job" | null;
  lguId?: string | null;
  fromIso?: string | null;
  toIso?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
};

/** 탭 조건에 필요한 사전 조회 결과 (요청마다 1회) */
export type TradePostsContext = {
  /** 활성 거래 카테고리 (사용자 앱 노출 기준) */
  activeTradeCategoryIds: string[];
  /** 전체 거래 카테고리 (비활성 포함) */
  allTradeCategoryIds: string[];
  /** 대기 신고가 걸린 게시물 */
  reportedPostIds: string[];
  /** lguId 필터 → 레거시 region/city 매핑 */
  legacyLguPairs: { regionId: string; cityIds: string[] }[];
};

export async function loadTradePostsContext(
  sb: SupabaseClient,
  opts: { lguId?: string | null; needReported?: boolean } = {}
): Promise<{ ok: true; ctx: TradePostsContext } | { ok: false; error: string }> {
  const { data: cats, error: cErr } = await sb.from("categories").select("id, is_active").eq("type", "trade");
  if (cErr) return { ok: false, error: cErr.message };
  const rows = (cats ?? []) as { id: string; is_active: boolean | null }[];

  let reportedPostIds: string[] = [];
  if (opts.needReported !== false) {
    const { data: reps, error: rErr } = await sb
      .from("reports")
      .select("product_id, target_id, target_type")
      .in("status", [...TRADE_ADMIN_OPEN_REPORT_STATUSES])
      .in("target_type", ["product", "post"])
      .limit(2000);
    if (rErr) return { ok: false, error: rErr.message };
    reportedPostIds = [
      ...new Set(
        ((reps ?? []) as { product_id: string | null; target_id: string | null }[])
          .map((r) => r.product_id ?? r.target_id ?? "")
          .filter(Boolean)
      ),
    ];
  }

  const legacyLguPairs: { regionId: string; cityIds: string[] }[] = [];
  if (opts.lguId) {
    const { data: map, error: mErr } = await sb
      .from("trade_local_area_lgu_map")
      .select("region_id, city_id")
      .eq("canonical_id", opts.lguId);
    if (mErr) return { ok: false, error: mErr.message };
    const byRegion = new Map<string, string[]>();
    for (const m of (map ?? []) as { region_id: string; city_id: string }[]) {
      const arr = byRegion.get(m.region_id) ?? [];
      arr.push(m.city_id);
      byRegion.set(m.region_id, arr);
    }
    for (const [regionId, cityIds] of byRegion) legacyLguPairs.push({ regionId, cityIds });
  }

  return {
    ok: true,
    ctx: {
      activeTradeCategoryIds: rows.filter((r) => r.is_active !== false).map((r) => r.id),
      allTradeCategoryIds: rows.map((r) => r.id),
      reportedPostIds,
      legacyLguPairs,
    },
  };
}

const NONE_ID = "00000000-0000-0000-0000-000000000000";
const csv = (ids: string[]) => (ids.length ? ids.join(",") : NONE_ID);
const PG_SAFE = /^[A-Za-z0-9_\-.]+$/;

function applyNotHidden(q: Q): Q {
  return q.eq("moderation_state", "visible").eq("owner_state", "none");
}

/**
 * 탭 + 검색·필터 조건. 논리식(or) 은 PostgREST `and=(…)` 하나로 모은다
 * (앱 목록의 `applyPostgrestAndGroup` 과 같은 방식 — or 파라미터를 여러 개 쓰지 않는다).
 */
export function applyTradePostsWhere(q: Q, tab: TradePostTab, f: TradePostsFilter, ctx: TradePostsContext): Q {
  let b = q;
  const groups: string[] = [];

  switch (tab) {
    case "all":
      break;
    case "visible": {
      const andGroup = buildTradePostsStatusAndTradeCategoryOnlyAndFilter(ctx.activeTradeCategoryIds);
      if (!andGroup) b = b.eq("id", NONE_ID);
      // 앱 목록과 같은 식: "(or(status…),or(trade_category_id…))" → 바깥 괄호를 벗겨 같은 and 그룹에 넣는다
      else groups.push(andGroup.replace(/^\(/, "").replace(/\)$/, ""));
      break;
    }
    case "selling":
      b = applyNotHidden(b).in("seller_listing_state", ["inquiry", "negotiating"]);
      break;
    case "reserved":
      b = applyNotHidden(b).eq("seller_listing_state", "reserved");
      break;
    case "sold":
      b = applyNotHidden(b).eq("seller_listing_state", "completed");
      break;
    case "admin_hidden":
    case "admin_deleted":
      b = b.eq("moderation_state", tab);
      break;
    case "owner_hidden":
    case "owner_deleted":
      b = b.eq("owner_state", tab);
      break;
    case "reported":
      b = b.in("id", ctx.reportedPostIds.length ? ctx.reportedPostIds : [NONE_ID]);
      break;
    case "unclassified":
      groups.push(`or(trade_category_id.is.null,trade_category_id.not.in.(${csv(ctx.activeTradeCategoryIds)}))`);
      break;
  }

  const term = sanitizeAdminListSearch(f.q);
  if (term) {
    if (isAdminListUuid(term)) b = b.eq("id", term);
    else {
      const like = `%${escapeAdminIlike(term)}%`;
      groups.push(`or(title.ilike.${quotePostgrestOrValue(like)},content.ilike.${quotePostgrestOrValue(like)})`);
    }
  }
  if (f.sellerId) b = b.eq("user_id", f.sellerId);
  if (f.categoryId) b = b.eq("trade_category_id", f.categoryId);
  if (f.tradeType) b = b.eq("trade_type", f.tradeType);
  if (f.fromIso) b = b.gte("created_at", f.fromIso);
  if (f.toIso) b = b.lt("created_at", f.toIso);
  if (typeof f.priceMin === "number") b = b.gte("price", f.priceMin);
  if (typeof f.priceMax === "number") b = b.lte("price", f.priceMax);
  if (f.lguId && PG_SAFE.test(f.lguId)) {
    const parts = [`trade_lgu_id.eq.${f.lguId}`];
    for (const p of ctx.legacyLguPairs) {
      const cities = p.cityIds.filter((c) => PG_SAFE.test(c));
      if (!PG_SAFE.test(p.regionId) || cities.length === 0) continue;
      parts.push(`and(trade_lgu_id.is.null,region.eq.${p.regionId},city.in.(${cities.join(",")}))`);
    }
    groups.push(`or(${parts.join(",")})`);
  }

  if (groups.length) applyPostgrestAndGroup(b, `(${groups.join(",")})`);
  return b;
}

export function applyTradePostsSort(q: Q, sort: TradePostSort): Q {
  switch (sort) {
    case "updated":
      return q.order("updated_at", { ascending: false }).order("id", { ascending: false });
    case "price_desc":
      return q.order("price", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
    case "price_asc":
      return q.order("price", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    case "views":
      return q.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    default:
      return q.order("created_at", { ascending: false }).order("id", { ascending: false });
  }
}

/** 건수 (head count). 실패는 null — 화면에서 0 과 구분해 「확인 불가」 */
export async function countTradePosts(
  sb: SupabaseClient,
  tab: TradePostTab,
  f: TradePostsFilter,
  ctx: TradePostsContext
): Promise<number | null> {
  try {
    let q: Q = (sb as Q).from("posts").select("id", { count: "exact", head: true });
    q = applyTradePostsWhere(q, tab, f, ctx);
    const { count, error } = await q;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

export const TRADE_ADMIN_POST_LIST_SELECT =
  "id, user_id, title, price, is_free_share, is_price_offer, status, seller_listing_state, moderation_state, owner_state, " +
  "moderation_reason, moderation_at, thumbnail_url, images, region, city, trade_lgu_id, trade_category_id, trade_type, " +
  "view_count, favorite_count, chat_count, sold_buyer_id, reserved_buyer_id, created_at, updated_at";

export async function listTradePosts(
  sb: SupabaseClient,
  input: { tab: TradePostTab; filter: TradePostsFilter; sort: TradePostSort; offset: number; limit: number },
  ctx: TradePostsContext
): Promise<{ ok: true; rows: Record<string, unknown>[]; total: number } | { ok: false; error: string }> {
  let q: Q = (sb as Q).from("posts").select(TRADE_ADMIN_POST_LIST_SELECT, { count: "exact" });
  q = applyTradePostsWhere(q, input.tab, input.filter, ctx);
  q = applyTradePostsSort(q, input.sort);
  const { data, error, count } = await q.range(input.offset, input.offset + input.limit - 1);
  if (error) return { ok: false, error: String(error.message ?? error) };
  const rows = (data ?? []) as Record<string, unknown>[];
  return { ok: true, rows, total: typeof count === "number" ? count : rows.length };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * 게시물 → LGU(시·군) 판정. trade_lgu_id 가 있으면 그대로, 없으면 레거시 region/city 를 기존 매핑 테이블
 * (trade_local_area_lgu_map — 사용자 앱 지역 필터와 같은 매핑)로 읽기 시점에만 환산한다. 데이터는 바꾸지 않는다.
 */
export async function resolveTradePostLguIds(
  sb: SupabaseClient,
  rows: { id: unknown; trade_lgu_id?: unknown; region?: unknown; city?: unknown }[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const legacy: { id: string; region: string; city: string }[] = [];
  for (const r of rows) {
    const id = String(r.id ?? "");
    const lgu = String(r.trade_lgu_id ?? "").trim();
    if (lgu) out.set(id, lgu);
    else if (r.region && r.city) legacy.push({ id, region: String(r.region), city: String(r.city) });
  }
  const regions = [...new Set(legacy.map((l) => l.region))];
  if (regions.length) {
    const { data } = await sb
      .from("trade_local_area_lgu_map")
      .select("region_id, city_id, canonical_id")
      .in("region_id", regions);
    const key = (a: string, b: string) => `${a}\u0000${b}`;
    const m = new Map(
      ((data ?? []) as { region_id: string; city_id: string; canonical_id: string }[]).map((x) => [
        key(x.region_id, x.city_id),
        x.canonical_id,
      ])
    );
    for (const l of legacy) {
      const c = m.get(key(l.region, l.city));
      if (c) out.set(l.id, c);
    }
  }
  return out;
}
