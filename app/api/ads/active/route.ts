import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchActiveTopFixedAdFeedPostsFromDb } from "@/lib/ads/post-ads-supabase";
import { fetchActiveCommunityPromotedPostIds } from "@/lib/promotion/community-paid-exposure-feed";
import { PROMOTED_TOP_PINS_MAX } from "@/lib/promotion/promoted-top-pins";
import type { ActiveAdFeedItem, ActiveAdsResponse } from "@/lib/ads/types";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { listNeighborhoodFeed } from "@/lib/neighborhood/queries";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/get-optional-authenticated-user-id";
import {
  COMMUNITY_FEED_TOP_SELECT_TAIL,
  selectCommunityFeedTopRows,
  type CommunityFeedTopRowFields,
} from "@/lib/community-feed/community-feed-top-posts";
import { loadPhilifeDefaultSectionTopics } from "@/lib/neighborhood/philife-neighborhood-topics";
import { resolveNeighborhoodListSort } from "@/lib/neighborhood/philife-neighborhood-feed-sort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 위쪽 카드 값을 찾을 때 한 번에 읽는 글 수 · 최대 회차 (보는 회원에게 안 보이는 글을 건너뛰기 위함) */
const TOP_LOOKUP_CHUNK = 20;
const TOP_LOOKUP_MAX_ROUNDS = 5;

/** 이 글들 중 피드 첫 페이지 운영 고정 자리(공지·고정)에 오는 글 — 조회 실패 시 빈 집합(예전 동작) */
async function loadCommunityOperatorTopIds(
  sb: ReturnType<typeof getSupabaseServer>,
  ids: string[],
  filterCat: string | null,
  nowMs: number
): Promise<Set<string>> {
  try {
    const { data, error } = await sb
      .from("community_posts")
      .select("id, topic_slug, published_at, created_at" + COMMUNITY_FEED_TOP_SELECT_TAIL)
      .in("id", ids);
    if (error || !Array.isArray(data)) return new Set();
    const rows = data as unknown as CommunityFeedTopRowFields[];
    return new Set(
      selectCommunityFeedTopRows(rows, { filterTopicSlug: filterCat, nowMs }).map((r) => String(r.id ?? ""))
    );
  } catch {
    return new Set();
  }
}

/**
 * GET /api/ads/active?boardKey=plife&topic=
 * Community TOP pin — canonical: point_promotion_orders (domain=community).
 * 응답: 남은 기간(endAt)·결제 시각(startAt)·순위(priority) 없음 · `adId` = 글 id (광고 ② PV-4 2026-11-04).
 * 광고 ② PB-21: 광고 중인 글 **전체**(안전 상한 500) — 위쪽 `PROMOTED_TOP_PINS_MAX`(1)개(앞에 오는 운영 고정 글 포함)만 `feedPost`(일반 목록과 같은 카드 값), 나머지는 id 만.
 * Owner 2026-11-05: 위쪽 카드 값은 모든 탭에서 지역 조건 없음(예전 D-11 동네 한정 폐지).
 * Legacy post_ads active rows merged for read compatibility (deduped by postId, 전체 주제일 때만).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const boardKey = sp.get("boardKey")?.trim() || "plife";
  const topic = sp.get("topic")?.trim() || sp.get("category")?.trim() || "";
  try {
    const sb = getSupabaseServer();
    const canonical = await fetchActiveCommunityPromotedPostIds(sb, { topicFilter: topic });
    const legacy = await fetchActiveTopFixedAdFeedPostsFromDb(sb, boardKey);

    const postIds: string[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      const pid = id.trim();
      if (!pid || seen.has(pid)) return;
      seen.add(pid);
      postIds.push(pid);
    };
    if (canonical.ok) for (const it of canonical.items) push(it.postId);
    // Legacy rows lack topic — 전체 주제(COMMUNITY_HOME)에서만 합친다.
    if (legacy.ok && !topic) for (const ad of legacy.ads) push(String(ad.postId ?? ""));

    /**
     * Owner 2026-11-05 「광고 지역 제한 전면 해제」: 위쪽 카드 값은 보는 회원의 동네·지역과 상관없이 고른다.
     * 예전 화면이 `locationKey` 를 보내도 쓰지 않는다(D-11 폐지).
     */
    const scope = { allLocations: true } as const;

    // 일반 목록과 같은 카드 값 — 같은 조회 함수(`listNeighborhoodFeed`)·같은 변환·같은 차단/숨김 규칙
    const viewerUserId = await getOptionalAuthenticatedUserId().catch(() => null);
    const feedPostById = new Map<string, NeighborhoodFeedPostDTO>();
    if (postIds.length > 0) {
      /**
       * Owner 2026-11-05 「빈자리는 다음 유효 광고로」: 운영 고정(공지·고정) 글은 화면이 운영 고정 자리에 두고 광고 자리에서 뺀다
       * (`planCommunityFeedAdPlacement`). 그래서 운영 고정이 아닌 광고가 위쪽 개수만큼 나올 때까지 카드 값을 싣는다 —
       * 운영 고정 판정 = 피드와 같은 함수·같은 주제 값(`selectCommunityFeedTopRows` · `resolveNeighborhoodListSort`).
       * 운영 고정 칸이 없는 화면(이웃만·해시태그)에서는 화면이 앞 글을 그대로 쓴다.
       */
      const topics = await loadPhilifeDefaultSectionTopics().catch(() => []);
      const filterCat = resolveNeighborhoodListSort(topic || null, "latest", topics).filterCategory;
      const nowMs = Date.now();
      let nonOperatorCards = 0;
      for (let round = 0; round < TOP_LOOKUP_MAX_ROUNDS; round++) {
        if (nonOperatorCards >= PROMOTED_TOP_PINS_MAX) break;
        const chunk = postIds.slice(round * TOP_LOOKUP_CHUNK, (round + 1) * TOP_LOOKUP_CHUNK);
        if (chunk.length === 0) break;
        const [feed, operatorIds] = await Promise.all([
          listNeighborhoodFeed({ ...scope, postIds: chunk, viewerUserId }).catch(() => null),
          loadCommunityOperatorTopIds(sb, chunk, filterCat, nowMs),
        ]);
        const byId = new Map((feed?.posts ?? []).map((p) => [String(p.id), p]));
        for (const id of chunk) {
          if (nonOperatorCards >= PROMOTED_TOP_PINS_MAX) break;
          const p = byId.get(id);
          if (!p) continue;
          feedPostById.set(id, p);
          if (!operatorIds.has(id)) nonOperatorCards += 1;
        }
      }
    }

    const ads: ActiveAdFeedItem[] = postIds.map((postId) => ({
      adId: postId,
      postId,
      feedPost: feedPostById.get(postId) ?? null,
    }));
    const res: ActiveAdsResponse = {
      ok: true,
      ads,
      meta: {
        source: canonical.ok ? "point_promotion_orders" : legacy.ok ? "supabase" : "empty",
      },
    };
    return NextResponse.json(res, {
      headers: { "Cache-Control": "private, max-age=0, must-revalidate" },
    });
  } catch {
    const res: ActiveAdsResponse = {
      ok: true,
      ads: [],
      meta: { source: "empty", hint: "서버 설정(Supabase)이 없어 광고를 조회하지 못했습니다." },
    };
    return NextResponse.json(res, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
