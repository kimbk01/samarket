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

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const topics = await loadPhilifeDefaultSectionTopics();
    const feedChips = topics.length > 0 ? buildPhilifeFeedChipsFromTopics(topics) : [];
    const writeTopics = topics.length > 0 ? buildPhilifeWriteTopicOptionsFromTopics(topics) : [];
    return NextResponse.json({
      ok: true,
      feedChips,
      writeTopics,
      source: topics.length > 0 ? "community_topics" : "community_topics_empty",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        feedChips: [],
        writeTopics: [],
        source: "error",
        error: (e as Error).message,
      },
      { status: 200 }
    );
  }
}
