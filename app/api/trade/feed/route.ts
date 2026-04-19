import { NextRequest } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchTradeCategoryDescendantNodes } from "@/lib/market/trade-category-subtree";
import { computeMarketFilterIds } from "@/lib/market/compute-market-filter-ids";
import { resolveTradeMarketParentParam } from "@/lib/posts/resolve-trade-market-parent-param";
import { resolveTradeFeedOpenPayload } from "@/lib/posts/resolve-trade-feed-open-payload";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonErrorWithRequest, jsonOkWithRequest } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCategoryIds(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

function parsePage(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function parseSort(raw: string | null): "latest" | "popular" {
  return raw === "popular" ? "popular" : "latest";
}

function parseJobKind(raw: string | null): JobListingKindFilter | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "work") return "work";
  if (t === "hire") return "hire";
  return undefined;
}

/**
 * GET /api/trade/feed — 거래 마켓 카테고리 피드 (목록 단일 소스).
 * `fetchTradeFeedPage` → `fetchPostsRangeForTradeCategories` — 홈 `GET /api/home/posts` 와 구현이 다르다.
 * 계약: `docs/trade-market-feed-contract.md`
 *
 * Query:
 * - `tradeMarketParent` + 선택 `topic` — 서버에서 `categories` 트리를 펼쳐 필터 id 계산
 * - 또는 `categoryIds=id1,id2` — 레거시·직접 나열
 */
export async function GET(req: NextRequest) {
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return jsonErrorWithRequest(req, "supabase_unconfigured", 503, { posts: [], hasMore: false });
  }

  const { searchParams } = new URL(req.url);
  const tradeMarketParent = await resolveTradeMarketParentParam(
    clients.readSb as SupabaseClient<any>,
    searchParams.get("tradeMarketParent")
  );
  const topicParam = (searchParams.get("topic")?.trim() ?? "").normalize("NFC");
  const categoryIdsParam = parseCategoryIds(searchParams.get("categoryIds"));

  let categoryIds: string[];
  if (tradeMarketParent) {
    /** `getSupabaseServer()` 실패 시에도 `.env` 서비스 롤이 있으면 트리 확장만이라도 우회 */
    const qsb =
      tryCreateSupabaseServiceClient() ?? clients.serviceSb ?? clients.readSb;
    const childrenForFilter = await fetchTradeCategoryDescendantNodes(qsb, tradeMarketParent);
    categoryIds = computeMarketFilterIds({
      parentCategoryId: tradeMarketParent,
      activeChildren: childrenForFilter,
      topicParam,
    });
  } else if (categoryIdsParam.length > 0) {
    categoryIds = categoryIdsParam;
  } else {
    return jsonErrorWithRequest(req, "tradeMarketParent_or_categoryIds_required", 400);
  }

  const page = parsePage(searchParams.get("page"));
  const sort = parseSort(searchParams.get("sort"));
  const jobsListingKind = parseJobKind(searchParams.get("jk"));

  const viewerId = await getOptionalAuthenticatedUserId();
  const open = await resolveTradeFeedOpenPayload(
    clients,
    categoryIds,
    { page, sort, jobsListingKind },
    viewerId
  );

  return jsonOkWithRequest(
    req,
    { posts: open.posts, hasMore: open.hasMore, favoriteMap: open.favoriteMap },
    { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30", Vary: "Cookie" } }
  );
}
