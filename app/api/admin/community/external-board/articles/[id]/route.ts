import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";
import { fetchAndPersistImmutableSnapshot } from "@/lib/external-board-import/snapshot/immutable-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const sb = getSupabaseServer();
    const article = await getExternalBoardArticle(sb, id);
    if (!article) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, article });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}

/** Fetch full document → immutable snapshot. */
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
    const updated = await fetchAndPersistImmutableSnapshot(sb, source, id);
    return NextResponse.json({ ok: true, article: updated });
  } catch (e) {
    const err = e as { failureStage?: string; failureCode?: string; message?: string };
    return NextResponse.json(
      {
        ok: false,
        error: err.message || String(e),
        failureStage: err.failureStage,
        failureCode: err.failureCode,
      },
      { status: 400 }
    );
  }
}
