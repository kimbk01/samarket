import { NextRequest, NextResponse } from "next/server";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { getTradeDetailRelatedData } from "@/services/trade/trade-detail.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[postId]/related
 * 거래 상세 본문 이후 related(판매자 다른 글/유사 글/광고) 후속 로드.
 *
 * 보조 API — 상세 related 데이터는 RSC `Suspense` + `PostDetailRelatedDeferredLoader`(`getTradeDetailRelatedData`) 로 스트림.
 * `.cursor/rules/trade-post-detail-chat-hot-path.mdc`
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "postId 필요" }, { status: 400 });
  }
  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 503 });
  }
  const viewerId = await getOptionalAuthenticatedUserId();
  const related = await getTradeDetailRelatedData(clients, { itemId: id, viewerUserId: viewerId });
  if (!related) {
    return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, related },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
        Vary: "Cookie",
      },
    }
  );
}
