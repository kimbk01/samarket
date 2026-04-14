import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadPostDetailShared } from "@/lib/posts/load-post-detail-shared";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[postId]/detail — 거래 글 상세(본문 포함). 브라우저 RLS와 무관하게 읽기.
 * 페이지 RSC(`loadPostDetailShared`)와 동일 로직.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "postId 필요" }, { status: 400 });
  }

  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const post = await loadPostDetailShared(clients, id, viewerId);
  if (!post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(post, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=45", Vary: "Cookie" },
  });
}
