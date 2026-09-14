import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { allowExternalBoardRepublish } from "@/lib/external-board-import/integrity/publication-tombstone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explicit Admin action only — clears tombstone so the same source article may publish again.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const articleId = String(id || "").trim();
  if (!articleId) {
    return NextResponse.json({ ok: false, error: "글 id가 필요합니다." }, { status: 400 });
  }
  try {
    const sb = getSupabaseServer();
    const article = await getExternalBoardArticle(sb, articleId);
    if (!article) {
      return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });
    }
    const result = await allowExternalBoardRepublish({
      sb,
      articleId,
      actorId: admin.userId,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, publication_state: "republish_allowed" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
