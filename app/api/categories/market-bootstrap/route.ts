/**
 * 마켓 거래 탭: 카테고리 단건 + 하위 주제를 **한 번의 HTTP**로 내려
 * 브라우저→Supabase 왕복(직접) 2회를 1회(Vercel→Supabase)로 줄임.
 * `includePosts=1` 이면 첫 페이지 글까지 합쳐 피드 워터폴을 줄임(알바는 `jk=hire|work` 와 동일 메타 필터).
 */
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { fetchTradeFeedPage } from "@/lib/posts/fetch-trade-feed-page";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { computeTradeFeedKey } from "@/lib/posts/trade-feed-key";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_CAT =
  "*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)";
const SELECT_CHILD =
  "*, category_settings(can_write, has_price, has_chat, has_location, has_direct_deal, has_free_share, post_type)";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return jsonError("q 파라미터가 필요합니다.", 400);
  }

  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) {
    return jsonError("데이터베이스 설정이 없습니다.", 503);
  }

  const rawTrim = q;
  const id = normalizeMarketSlugParam(q);
  if (!id) {
    return jsonError("유효하지 않은 경로입니다.", 400);
  }

  const sb = supabase as any;
  const baseQuery = () => sb.from("categories").select(SELECT_CAT);

  let cat: Record<string, unknown> | null = null;
  let err: unknown = null;

  if (UUID_REGEX.test(id)) {
    const res = await baseQuery().eq("id", id).limit(1).maybeSingle();
    err = res.error;
    cat = res.data as Record<string, unknown> | null;
  }
  if (!cat && !err) {
    const res = await baseQuery().eq("slug", id).limit(1).maybeSingle();
    err = res.error;
    cat = res.data as Record<string, unknown> | null;
  }
  if (!cat && !err && rawTrim !== id) {
    const res = await baseQuery().eq("slug", rawTrim).limit(1).maybeSingle();
    err = res.error;
    cat = res.data as Record<string, unknown> | null;
  }

  if (err || !cat?.id) {
    return jsonError("카테고리를 찾을 수 없습니다.", 404);
  }

  const parentId = String(cat.id);
  const { data: childRows, error: childErr } = await sb
    .from("categories")
    .select(SELECT_CHILD)
    .eq("parent_id", parentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (childErr) {
    return jsonError("하위 주제를 불러오지 못했습니다.", 500);
  }

  const childrenArr = Array.isArray(childRows) ? childRows : [];
  const iconKey = String((cat as { icon_key?: unknown }).icon_key ?? "");
  const slugVal = String((cat as { slug?: unknown }).slug ?? "");
  const isJobMarket =
    iconKey === "job" || iconKey === "jobs" || slugVal === "job";

  const includePosts = req.nextUrl.searchParams.get("includePosts") === "1";
  const topicParam = (req.nextUrl.searchParams.get("topic")?.trim() ?? "").normalize("NFC");
  const jkRaw = req.nextUrl.searchParams.get("jk")?.trim().toLowerCase();
  /** `MarketCategoryFeed` 의 `parseJobListingKindParam` 과 동일 — 기본 구인 */
  const jobListingKindForFeed: JobListingKindFilter | undefined = isJobMarket
    ? jkRaw === "work"
      ? "work"
      : "hire"
    : undefined;

  let initialFeed: { posts: unknown[]; hasMore: boolean; feedKey: string } | undefined;

  if (includePosts) {
    const childForFilter = childrenArr.map((r: Record<string, unknown>) => ({
      id: String(r.id ?? ""),
      slug: typeof r.slug === "string" ? r.slug : null,
    }));
    const filterIds = computeMarketFilterIds({
      parentCategoryId: parentId,
      children: childForFilter,
      topicParam,
    });
    const { posts, hasMore } = await fetchTradeFeedPage(supabase, filterIds, {
      page: 1,
      sort: "latest",
      jobsListingKind: jobListingKindForFeed,
    });
    const feedKey = computeTradeFeedKey(filterIds, "latest", jobListingKindForFeed);
    initialFeed = {
      posts,
      hasMore,
      feedKey,
    };
  }

  return jsonOk({
    category: cat,
    children: childrenArr,
    ...(initialFeed ? { initialFeed } : {}),
  });
}
