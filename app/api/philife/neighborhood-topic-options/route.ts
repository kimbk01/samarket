/**
 * 필라이프 동네 피드·글쓰기 — `community_topics`(dongnae) 기준 주제 목록 (공개 GET)
 */
import { NextResponse } from "next/server";
import {
  buildPhilifeFeedChipsFromTopics,
  buildPhilifeWriteTopicOptionsFromTopics,
  loadPhilifeDefaultSectionTopics,
} from "@/lib/neighborhood/philife-neighborhood-topics";
import {
  NEIGHBORHOOD_CATEGORY_LABELS,
  NEIGHBORHOOD_CATEGORY_SLUGS,
} from "@/lib/neighborhood/categories";

export const dynamic = "force-dynamic";

function fallbackFeedChips() {
  return NEIGHBORHOOD_CATEGORY_SLUGS.map((slug) => ({
    slug,
    name: NEIGHBORHOOD_CATEGORY_LABELS[slug],
  }));
}

function fallbackWriteOptions() {
  return NEIGHBORHOOD_CATEGORY_SLUGS.filter((s) => s !== "meetup").map((slug) => ({
    slug,
    name: NEIGHBORHOOD_CATEGORY_LABELS[slug],
  }));
}

export async function GET() {
  try {
    const topics = await loadPhilifeDefaultSectionTopics();
    const feedChips =
      topics.length > 0 ? buildPhilifeFeedChipsFromTopics(topics) : fallbackFeedChips();
    const writeTopics =
      topics.length > 0 ? buildPhilifeWriteTopicOptionsFromTopics(topics) : fallbackWriteOptions();
    return NextResponse.json({
      ok: true,
      feedChips,
      writeTopics,
      source: topics.length > 0 ? "community_topics" : "fallback_constants",
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: true,
        feedChips: fallbackFeedChips(),
        writeTopics: fallbackWriteOptions(),
        source: "fallback_constants",
        warn: (e as Error).message,
      },
      { status: 200 }
    );
  }
}
