import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";
import {
  loadPostRowForDetail,
  mapPostDetailRowToPostWithMeta,
} from "@/lib/posts/map-post-detail-row";
import { computeDetailSectionsForLoadedPost } from "@/lib/posts/detail-sections/get-detail-sections-for-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[postId]/detail — 거래 글 상세(본문 포함). 브라우저 RLS와 무관하게 읽기.
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

  let row =
    (await loadPostRowForDetail(clients.readSb, POSTS_TABLE_READ, id)) ??
    (clients.serviceSb && clients.serviceSb !== clients.readSb
      ? await loadPostRowForDetail(clients.serviceSb, POSTS_TABLE_READ, id)
      : null) ??
    (clients.serviceSb ? await loadPostRowForDetail(clients.serviceSb, "posts", id) : null);

  if (!row) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const sellerId = typeof row.user_id === "string" ? row.user_id : "";
  const reserved = row.reserved_buyer_id;
  const canSeeReservedBuyer =
    Boolean(viewerId) &&
    reserved != null &&
    reserved !== "" &&
    (viewerId === sellerId || viewerId === reserved);

  if (reserved != null && reserved !== "" && !canSeeReservedBuyer) {
    row = { ...row, reserved_buyer_id: null };
  }

  const post = mapPostDetailRowToPostWithMeta(row);

  const wantRecommend = req.nextUrl.searchParams.get("recommendSections") === "1";
  if (wantRecommend) {
    const detailSections = await computeDetailSectionsForLoadedPost(clients, post);
    return NextResponse.json(
      { post, detailSections },
      {
        headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=45", Vary: "Cookie" },
      }
    );
  }

  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, [post]);

  return NextResponse.json(post, {
    headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=45", Vary: "Cookie" },
  });
}
