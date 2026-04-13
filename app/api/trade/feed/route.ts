import { NextRequest, NextResponse } from "next/server";
import { fetchTradeFeedPage } from "@/lib/posts/fetch-trade-feed-page";
import type { JobListingKindFilter } from "@/lib/jobs/matches-job-listing-kind";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";

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
 * GET /api/trade/feed — 거래 마켓 카테고리 피드 (서버·RLS와 무관하게 홈 API와 동일 클라이언트 계층 사용)
 * Query: categoryIds=id1,id2 (필수), page, sort, jk (알바 hire|work)
 */
export async function GET(req: NextRequest) {
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ ok: false, posts: [], hasMore: false }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const categoryIds = parseCategoryIds(searchParams.get("categoryIds"));
  if (categoryIds.length === 0) {
    return NextResponse.json({ ok: false, error: "categoryIds_required" }, { status: 400 });
  }

  const page = parsePage(searchParams.get("page"));
  const sort = parseSort(searchParams.get("sort"));
  const jobsListingKind = parseJobKind(searchParams.get("jk"));

  const opts = { page, sort, jobsListingKind };

  let result = await fetchTradeFeedPage(clients.readSb, categoryIds, opts);
  if (
    result.posts.length === 0 &&
    clients.serviceSb &&
    clients.serviceSb !== clients.readSb
  ) {
    const alt = await fetchTradeFeedPage(clients.serviceSb, categoryIds, opts);
    if (alt.posts.length > 0) {
      result = alt;
    }
  }

  return NextResponse.json(
    { ok: true, posts: result.posts, hasMore: result.hasMore },
    { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30", Vary: "Cookie" } }
  );
}
