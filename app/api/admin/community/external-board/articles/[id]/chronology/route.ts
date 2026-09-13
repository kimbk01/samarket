import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardArticle } from "@/lib/external-board-import/discovery/article-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** MANUAL UNKNOWN chronology: set explicit operator published_at / batch order. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      operatorPublishedAt?: string | null;
      operatorBatchOrder?: number | null;
      sourcePublishedAt?: string | null;
    };
    const sb = getSupabaseServer();
    const existing = await getExternalBoardArticle(sb, id);
    if (!existing) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.operatorPublishedAt !== undefined) {
      updates.operator_published_at = body.operatorPublishedAt
        ? String(body.operatorPublishedAt).trim() || null
        : null;
    }
    if (body.operatorBatchOrder !== undefined) {
      updates.operator_batch_order =
        body.operatorBatchOrder == null ? null : Number(body.operatorBatchOrder);
    }
    if (body.sourcePublishedAt !== undefined) {
      updates.source_published_at = body.sourcePublishedAt
        ? String(body.sourcePublishedAt).trim() || null
        : null;
    }

    const { error } = await sb.from("external_board_articles").update(updates).eq("id", id);
    if (error) throw new Error(error.message);
    const article = await getExternalBoardArticle(sb, id);
    return NextResponse.json({ ok: true, article });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
