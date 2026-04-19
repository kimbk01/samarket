import { NextRequest, NextResponse } from "next/server";
import { resolvePostsReadClients } from "@/lib/supabase/resolve-posts-read-clients";
import { fetchPostsByAuthorWithSupabase } from "@/lib/posts/posts-by-author-query-core";
import { enrichPostsAuthorNicknamesFromProfiles } from "@/lib/posts/enrich-posts-author-nicknames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/posts/by-author?userId=
 * 거래 상세 — 판매자의 다른 물품 (브라우저 RLS와 무관하게 읽기).
 */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const excludePostId = req.nextUrl.searchParams.get("excludePostId")?.trim() ?? "";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(24, Math.floor(limitRaw))) : 12;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId 필요", posts: [] }, { status: 400 });
  }

  const clients = resolvePostsReadClients(req);
  if (!clients) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다.", posts: [] }, { status: 503 });
  }

  const posts = await fetchPostsByAuthorWithSupabase(clients.readSb, userId, {
    excludePostId: excludePostId || null,
    limit,
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
