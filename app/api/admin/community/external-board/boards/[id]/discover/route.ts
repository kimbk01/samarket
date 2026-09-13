import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getExternalBoardSource } from "@/lib/external-board-import/registry/source-board-store";
import { discoverExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      limit?: number;
      pageFrom?: number;
      pageTo?: number;
      dateFrom?: string | null;
      dateTo?: string | null;
    };
    const sb = getSupabaseServer();
    const source = await getExternalBoardSource(sb, id);
    if (!source) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const result = await discoverExternalBoardArticles(sb, source, {
      limit: body.limit,
      pageFrom: body.pageFrom,
      pageTo: body.pageTo,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
    return NextResponse.json({
      ok: true,
      items: result.items,
      articles: result.upserted,
      summary: result.summary,
    });
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
