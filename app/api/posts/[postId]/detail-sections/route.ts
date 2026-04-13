import { NextRequest, NextResponse } from "next/server";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { loadTradePostForDetailApis } from "@/lib/posts/map-post-detail-row";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { computeDetailSectionsForLoadedPost } from "@/lib/posts/detail-sections/get-detail-sections-for-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[postId]/detail-sections — 상세 하단 추천만 (클라이언트 폴백·외부 호출용).
 * 일반 상세는 `GET .../detail?recommendSections=1` 우선.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  const postId = (await params).postId?.trim() ?? "";
  if (!postId) {
    return NextResponse.json({ error: "postId 필요" }, { status: 400 });
  }

  const clients = resolvePostsReadClients(_req);
  if (!clients) {
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });
  }

  let post = await loadTradePostForDetailApis(clients.readSb, clients.serviceSb, postId);
  if (!post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  }

  const viewerId = await getOptionalAuthenticatedUserId();
  const merged = post as typeof post & { user_id?: string };
  const sellerId = typeof merged.user_id === "string" ? merged.user_id : "";
  const reserved = post.reserved_buyer_id;
  const canSeeReservedBuyer =
    Boolean(viewerId) &&
    reserved != null &&
    reserved !== "" &&
    (viewerId === sellerId || viewerId === reserved);

  if (reserved != null && reserved !== "" && !canSeeReservedBuyer) {
    post = { ...post, reserved_buyer_id: null };
  }

  const sections = await computeDetailSectionsForLoadedPost(clients, post);

  return NextResponse.json(
    { sections },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
        Vary: "Cookie",
      },
    }
  );
}
