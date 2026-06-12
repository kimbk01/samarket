import { NextRequest, NextResponse } from "next/server";
import { resolveHomePostsGetData } from "@/lib/posts/home-posts-route-core";
import { postsToFeedCandidates } from "@/lib/feed/posts-to-feed-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 공개 홈 피드 실험용 후보 — 실 posts 기반 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const feedReq = new NextRequest(
      new URL(`/api/philife/posts?page=1&sort=latest&type=trade`, url.origin),
      { headers: req.headers }
    );
    const data = await resolveHomePostsGetData(feedReq);
    const candidates = postsToFeedCandidates(data.posts ?? []);
    return NextResponse.json({ ok: true, candidates, source: "posts" as const });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      candidates: [],
      source: "error" as const,
      hint: e instanceof Error ? e.message : String(e),
    });
  }
}
