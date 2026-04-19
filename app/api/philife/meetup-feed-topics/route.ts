import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listMeetupFeedTopicsPublic } from "@/lib/neighborhood/meetup-feed-topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 로그인 사용자 — 모임 만들기 피드 주제 = 동네(dongnae) 섹션 `community_topics` 중 어드민 「모임」 탭과 동일 집합 */
export async function GET() {
  try {
    const sb = getSupabaseServer();
    const topics = await listMeetupFeedTopicsPublic(sb);
    return NextResponse.json({ ok: true, topics });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, topics: [] }, { status: 503 });
  }
}
