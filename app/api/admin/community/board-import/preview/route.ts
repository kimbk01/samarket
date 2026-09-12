import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { previewBoardImportArticle } from "@/lib/community-board-import/transform-publish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  try {
    const body = (await req.json()) as { articleId?: string };
    const articleId = String(body.articleId ?? "").trim();
    if (!articleId) {
      return NextResponse.json({ ok: false, error: "article_id_required" }, { status: 400 });
    }
    const sb = getSupabaseServer();
    const result = await previewBoardImportArticle({ sb, articleId });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          failure_stage: result.failure_stage,
          failure_code: result.failure_code,
          failure_message: result.failure_message,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, preview: result.preview, communityWrite: 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "preview_failed" },
      { status: 500 }
    );
  }
}
