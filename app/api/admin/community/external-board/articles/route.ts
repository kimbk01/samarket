import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listExternalBoardArticles } from "@/lib/external-board-import/discovery/article-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sourceId = req.nextUrl.searchParams.get("sourceId")?.trim() || undefined;
    const sb = getSupabaseServer();
    const articles = await listExternalBoardArticles(sb, sourceId);
    return NextResponse.json({ ok: true, articles });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message) }, { status: 500 });
  }
}
