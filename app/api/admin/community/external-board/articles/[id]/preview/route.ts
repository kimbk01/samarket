import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { previewExternalBoardArticle } from "@/lib/external-board-import/preview/zero-write-preview";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const article = await getExternalBoardArticle(sb, id);
    if (!article) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const source = await getExternalBoardSource(sb, article.source_id);
    if (!source) return NextResponse.json({ ok: false, error: "source_not_found" }, { status: 404 });
    const preview = await previewExternalBoardArticle(sb, source, article);
    return NextResponse.json(preview);
  } catch (e) {
    return NextResponse.json({ ok: false, writeDelta: 0, error: String((e as Error).message) }, { status: 500 });
  }
}
