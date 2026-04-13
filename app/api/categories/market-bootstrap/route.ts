/**
 * 마켓 거래 탭: 카테고리 단건 + 하위 주제를 **한 번의 HTTP**로 내려
 * 브라우저→Supabase 왕복(직접) 2회를 1회(Vercel→Supabase)로 줄임.
 * `includePosts=1` 이면 첫 페이지 글은 `fetchTradeFeedPage` — `docs/trade-market-feed-contract.md`.
 */
import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { fetchTradeFeedPage } from "@/lib/posts/fetch-trade-feed-page";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { computeTradeFeedKeyForMarketParent } from "@/lib/posts/trade-feed-key";
import { CATEGORY_WITH_SETTINGS_SELECT } from "@/lib/categories/category-select-fragment";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return jsonError("q 파라미터가 필요합니다.", 400);
  }

  const cookieSb = await createSupabaseRouteHandlerClient();
  const svcSb = tryCreateSupabaseServiceClient();
  /** 카테고리·posts 조회 공통 — 서비스 롤이 있으면 우선(anon RLS 회피) */
  const supabase = svcSb ?? cookieSb;
  if (!supabase) {
    return jsonError("데이터베이스 설정이 없습니다.", 503);
  }

  const rawTrim = q;
  const id = normalizeMarketSlugParam(q);
  if (!id) {
    return jsonError("유효하지 않은 경로입니다.", 400);
  }

  const sb = supabase as any;
  const baseQuery = () => sb.from("categories").select(CATEGORY_WITH_SETTINGS_SELECT);

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
    .select(CATEGORY_WITH_SETTINGS_SELECT)
    .eq("parent_id", parentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (childErr) {
    return jsonError("하위 주제를 불러오지 못했습니다.", 500);
  }

  const rawChildren = Array.isArray(childRows) ? childRows : [];
  /** 2행 칩 UI 만: 홈 칩과 겹치는 하위(show_in_home_chips) 제외 — 피드 ID 와는 분리 */
  const childrenArr = rawChildren.filter(
    (r: Record<string, unknown>) => r.show_in_home_chips !== true
  );
  /** 피드: 루트 아래 **모든 깊이** trade 카테고리 — 글은 리프 UUID 로만 저장되는 경우가 많음 */
  const childrenForFilter = await fetchTradeCategoryDescendantNodes(supabase, parentId);
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
    const feedKey = computeTradeFeedKeyForMarketParent(parentId, topicParam, "latest", jobListingKindForFeed);
    /** 주제 없음·비알바: 첫 화면은 `/api/trade/feed` 와 동일 파이프라인 — 홈 전용 `resolveHomePostsPayload` 는 스키마/RLS 에서 빈 목록만 나오는 경우가 있어 마켓과 어긋남 */
    const useHomeQuery = !isJobMarket && !topicParam.trim();
    if (useHomeQuery) {
      const filterIds = computeMarketFilterIds({
        parentCategoryId: parentId,
        activeChildren: childrenForFilter,
        topicParam: "",
      });
      const result = await fetchTradeFeedPage(sb, filterIds, {
        page: 1,
        sort: "latest",
        jobsListingKind: undefined,
      });
      initialFeed = {
        posts: result.posts,
        hasMore: result.hasMore,
        feedKey,
      };
    } else {
      const filterIds = computeMarketFilterIds({
        parentCategoryId: parentId,
        activeChildren: childrenForFilter,
        topicParam,
      });
      const result = await fetchTradeFeedPage(supabase, filterIds, {
        page: 1,
        sort: "latest",
        jobsListingKind: jobListingKindForFeed,
      });
      initialFeed = {
        posts: result.posts,
        hasMore: result.hasMore,
        feedKey,
      };
    }
  }

  return jsonOk({
    category: cat,
    children: childrenArr,
    childrenForFilter,
    ...(initialFeed ? { initialFeed } : {}),
  });
}
