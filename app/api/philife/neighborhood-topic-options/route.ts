/**
 * 필라이프 동네 피드·글쓰기 — `community_topics`(동네 피드 섹션) 기준 주제 목록 (공개 GET)
 * DB에 주제가 없으면 빈 배열 — 레거시 상수 칩으로 채우지 않음(어드민과 화면 일치).
 */
import { NextResponse } from "next/server";
import {

  buildPhilifeFeedChipsFromTopics,
  buildPhilifeWriteTopicOptionsFromTopics,
  loadPhilifeDefaultSectionTopics,
} from "@/lib/neighborhood/philife-neighborhood-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 브라우저·CDN이 짧게 재사용 — 주제 변경은 수초~분 단위로 반영되면 충분 */
const TOPIC_OPTIONS_CACHE_CONTROL = "public, max-age=30, s-maxage=45, stale-while-revalidate=300";

export async function GET() {
  try {
    const topics = await loadPhilifeDefaultSectionTopics();
    const feedChips = topics.length > 0 ? buildPhilifeFeedChipsFromTopics(topics) : [];
    const writeTopics = topics.length > 0 ? buildPhilifeWriteTopicOptionsFromTopics(topics) : [];
    return NextResponse.json(
      {
        ok: true,
        feedChips,
        writeTopics,
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
        source: "error",
        error: (e as Error).message,
      },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
