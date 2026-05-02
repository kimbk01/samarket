/**
 * `/api/categories/market-bootstrap` · RSC 마켓 페이지가 공유하는 부트스트랩 본문.
 * 브라우저→Supabase 직접 왕복 대신 서버 한 번으로 첫 페인트를 맞춘다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { parseJobEmploymentFilterParam } from "@/lib/jobs/job-employment-filter";
import {
  parseJobListIndustryParam,
  parseJobListRegionParam,
} from "@/lib/jobs/job-list-url-params";
import { computeTradeFeedKeyForMarketParent, type TradeFeedSort } from "@/lib/posts/trade-feed-key";
import { CATEGORY_WITH_SETTINGS_SELECT } from "@/lib/categories/category-select-fragment";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";
import type { PostWithMeta } from "@/lib/posts/schema";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import type { PostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { resolveTradeFeedOpenPayload } from "@/lib/posts/resolve-trade-feed-open-payload";
import { isTradeJobMarketCategory } from "@/lib/market/is-trade-job-market-category";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBootstrapFeedSort(raw: string | undefined | null): TradeFeedSort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "popular") return "popular";
  if (s === "pay_desc") return "pay_desc";
  if (s === "chat_desc") return "chat_desc";
  if (s === "near") return "near";
  return "latest";
}

function parseJobListingKindParam(raw: string | undefined | null): JobListingKindFilter | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "work") return "work";
  if (t === "hire") return "hire";
  return undefined;
}

export type MarketBootstrapInitialFeed = {
  posts: PostWithMeta[];
  hasMore: boolean;
  feedKey: string;
  /** 로그인 시 서버에서 조회 — 클라 `/api/favorites/status` 1회 생략 */
  favoriteMap?: Record<string, boolean>;
};

export type MarketBootstrapPayload = {
  category: Record<string, unknown>;
  children: Record<string, unknown>[];
  childrenForFilter: { id: string; slug: string | null }[];
  initialFeed?: MarketBootstrapInitialFeed;
};

export type LoadMarketBootstrapPayloadResult =
  | { ok: true; data: MarketBootstrapPayload }
  | { ok: false; httpStatus: 400 | 404 | 500; message: string };

export type LoadMarketBootstrapArgs = {
  q: string;
  /** `?topic=` 원문 (NFC 정규화는 내부에서 수행) */
  topic?: string;
  /** `?jk=` — 일자리 마켓에서만 피드에 반영 */
  jkParam?: string | null;
  includePosts: boolean;
  /** `GET /api/trade/feed` 와 동일 — 첫 피드에 찜 맵 포함 */
  viewerUserId?: string | null;
  /** 알바·공통 마켓 피드 정렬 (`latest` | `popular` | `pay_desc`) */
  fsParam?: string | null;
  /** 알바 근무 형태 필터 (`je=`) */
  jeParam?: string | null;
  /** 오늘 근무 가능 (`avail=1`) */
  availParam?: string | null;
  jrParam?: string | null;
  jcParam?: string | null;
};

export async function loadMarketBootstrapPayload(
  clients: PostsReadClients,
  args: LoadMarketBootstrapArgs
): Promise<LoadMarketBootstrapPayloadResult> {
  const supabase = clients.readSb as unknown as SupabaseClient;
  const q = args.q?.trim();
  if (!q) {
    return { ok: false, httpStatus: 400, message: "q 파라미터가 필요합니다." };
  }

  const rawTrim = q;
  const id = normalizeMarketSlugParam(q);
  if (!id) {
    return { ok: false, httpStatus: 400, message: "유효하지 않은 경로입니다." };
  }

  /** API 라우트와 동일 — 생성된 Database 타입 없이 categories/posts 체인만 사용 */
  const sb = supabase as unknown as SupabaseClient<Record<string, never>>;
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
    return { ok: false, httpStatus: 404, message: "카테고리를 찾을 수 없습니다." };
  }

  const parentId = String(cat.id);
  const { data: childRows, error: childErr } = await sb
    .from("categories")
    .select(CATEGORY_WITH_SETTINGS_SELECT)
    .eq("parent_id", parentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (childErr) {
    return { ok: false, httpStatus: 500, message: "하위 주제를 불러오지 못했습니다." };
  }

  const rawChildren = Array.isArray(childRows) ? childRows : [];
  const childrenArr = rawChildren.filter(
    (r: Record<string, unknown>) => r.show_in_home_chips !== true
  );
  /** API `GET /api/trade/feed` 와 동일 — 읽기 전용 RLS 한계 시 서비스 롤로 트리 확장 */
  const subtreeSb = (clients.serviceSb ?? clients.readSb) as unknown as SupabaseClient;
  const childrenForFilter = await fetchTradeCategoryDescendantNodes(subtreeSb, parentId);
  const isJobMarket = isTradeJobMarketCategory(
    cat as { icon_key?: unknown; slug?: unknown }
  );

  const topicParam = (args.topic?.trim() ?? "").normalize("NFC");

  let initialFeed: MarketBootstrapInitialFeed | undefined;
  const viewerUserId = args.viewerUserId?.trim() ?? "";

  if (args.includePosts) {
    const feedSort = parseBootstrapFeedSort(args.fsParam);
    const jobsListingKind = isJobMarket ? parseJobListingKindParam(args.jkParam) : undefined;
    const je = isJobMarket ? parseJobEmploymentFilterParam(args.jeParam ?? null) : undefined;
    const todayAvail = isJobMarket && (args.availParam ?? "").trim() === "1";
    const jr = isJobMarket ? parseJobListRegionParam(args.jrParam ?? null) : undefined;
    const jc = isJobMarket ? parseJobListIndustryParam(args.jcParam ?? null) : undefined;

    const keyExtras: {
      jobEmploymentType?: string;
      todayAvailable?: boolean;
      jobRegionSlug?: string;
      jobIndustrySlug?: string;
    } = {};
    if (isJobMarket) {
      if (je) keyExtras.jobEmploymentType = je;
      if (todayAvail) keyExtras.todayAvailable = true;
      if (jr) keyExtras.jobRegionSlug = jr;
      if (jc) keyExtras.jobIndustrySlug = jc;
    }

    const feedKey = computeTradeFeedKeyForMarketParent(
      parentId,
      topicParam,
      feedSort,
      jobsListingKind,
      keyExtras
    );

    const feedOptsBase = {
      page: 1 as const,
      sort: feedSort,
      restrictTradeTypeJob: isJobMarket,
      jobEmploymentType: isJobMarket ? je : undefined,
      todayAvailable: isJobMarket ? todayAvail : false,
      jobRegionSlug: isJobMarket ? jr : undefined,
      jobIndustrySlug: isJobMarket ? jc : undefined,
    };

    const useHomeQuery = !isJobMarket && !topicParam.trim();
    if (useHomeQuery) {
      const filterIds = computeMarketFilterIds({
        parentCategoryId: parentId,
        activeChildren: childrenForFilter,
        topicParam: "",
      });
      const open = await resolveTradeFeedOpenPayload(
        clients,
        filterIds,
        { ...feedOptsBase, jobsListingKind: undefined },
        viewerUserId || null
      );
      initialFeed = {
        posts: open.posts,
        hasMore: open.hasMore,
        feedKey,
        ...(viewerUserId && open.posts.length > 0 ? { favoriteMap: open.favoriteMap } : {}),
      };
    } else {
      const filterIds = computeMarketFilterIds({
        parentCategoryId: parentId,
        activeChildren: childrenForFilter,
        topicParam,
      });
      const open = await resolveTradeFeedOpenPayload(
        clients,
        filterIds,
        { ...feedOptsBase, jobsListingKind },
        viewerUserId || null
      );
      initialFeed = {
        posts: open.posts,
        hasMore: open.hasMore,
        feedKey,
        ...(viewerUserId && open.posts.length > 0 ? { favoriteMap: open.favoriteMap } : {}),
      };
    }
  }

  return {
    ok: true,
    data: {
      category: cat,
      children: childrenArr,
      childrenForFilter,
      ...(initialFeed ? { initialFeed } : {}),
    },
  };
}
