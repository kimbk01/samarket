/**
 * 필라이프 동네 피드·글쓰기 — `community_topics`(동네 피드 섹션) 기준 주제 목록 (공개 GET)
 * DB에 주제가 없으면 빈 배열 — 레거시 상수 칩으로 채우지 않음(어드민과 화면 일치).
 */
import { NextResponse } from "next/server";
import {
  getPhilifeShowAllFeedTabServer,
  getPhilifeShowNeighborOnlyFilterServer,
} from "@/lib/community-feed/philife-neighborhood-section";
import {
  buildPhilifeFeedChipsFromTopics,
  buildPhilifeWriteTopicOptionsFromTopics,
  loadPhilifeDefaultSectionTopics,
} from "@/lib/neighborhood/philife-neighborhood-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 짧은 캐시 — 어드민 `clearPhilifeDefaultSectionTopicsCache` 후에도 엣지가 지나치게 오래 잡지 않게 */
const TOPIC_OPTIONS_CACHE_CONTROL = "public, max-age=15, s-maxage=20, stale-while-revalidate=120";

export async function GET() {
  try {
    const [topics, showAllFeedTab, showNeighborOnlyFilter] = await Promise.all([
      loadPhilifeDefaultSectionTopics(),
      getPhilifeShowAllFeedTabServer(),
      getPhilifeShowNeighborOnlyFilterServer(),
    ]);
    const feedChips = topics.length > 0 ? buildPhilifeFeedChipsFromTopics(topics) : [];
    const writeTopics = topics.length > 0 ? buildPhilifeWriteTopicOptionsFromTopics(topics) : [];
    return NextResponse.json(
      {
        ok: true,
        feedChips,
        writeTopics,
        showAllFeedTab,
        showNeighborOnlyFilter,
        source: topics.length > 0 ? "community_topics" : "community_topics_empty",
      },
      { headers: { "Cache-Control": TOPIC_OPTIONS_CACHE_CONTROL } }
    );
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        feedChips: [],
        writeTopics: [],
        showAllFeedTab: true,
        showNeighborOnlyFilter: true,
        source: "error",
        error: (e as Error).message,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
