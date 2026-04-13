import { NextRequest, NextResponse } from "next/server";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { fetchSimilarPostsWithSupabase } from "@/lib/posts/similar-posts-query-core";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";

export const dynamic = "force-dynamic";

/**
 * GET /api/posts/[postId]/similar?categoryId=&limit=&excludeSeller=
 * 거래 상세 하단 유사 물품 — `getPostById` 와 동일하게 서버 읽기(서비스 롤 시 RLS와 무관).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const { postId } = await params;
  const id = typeof postId === "string" ? postId.trim() : "";
  const categoryId = req.nextUrl.searchParams.get("categoryId")?.trim() ?? "";
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(24, Math.max(1, Number(limitRaw) || 6));
  const excludeSeller = req.nextUrl.searchParams.get("excludeSeller")?.trim() ?? "";

  if (!id || !categoryId) {
    return NextResponse.json({ ok: false, error: "postId·categoryId 필요", posts: [] }, { status: 400 });
  }

  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다.", posts: [] }, { status: 503 });
  }

  const posts = await fetchSimilarPostsWithSupabase(clients.readSb, id, categoryId, limit, {
    excludeAuthorUserId: excludeSeller || null,
  });
  await enrichPostsAuthorNicknamesFromProfiles(clients.readSb, posts);

  return NextResponse.json(
    { ok: true, posts },
    {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
        Vary: "Cookie",
      },
    }
  );
}
