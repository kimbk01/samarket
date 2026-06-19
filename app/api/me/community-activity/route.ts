import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadCommunityActivityHubServer } from "@/lib/mypage/community-activity-load-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  try {
    const data = await loadCommunityActivityHubServer(auth.userId);
    return NextResponse.json({
      ok: true,
      comments: data.comments,
      favoritePosts: data.reactions,
      reactions: data.reactions,
      reports: data.reports,
      source: data.source,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? "activity_fetch_failed" },
      { status: 500 }
    );
  }
}
