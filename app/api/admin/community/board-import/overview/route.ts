import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listBoardImportSources } from "@/lib/community-board-import/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  try {
    const sb = getSupabaseServer();
    const sources = await listBoardImportSources(sb);
    const { data: topics } = await sb.from("community_topics").select("id, name, slug").order("name");
    const { data: pools } = await sb
      .from("community_author_pools")
      .select("id, name, description")
      .order("name");
    return NextResponse.json({
      ok: true,
      sources,
      topics: topics ?? [],
      authorPools: pools ?? [],
      publishWriter: "IMPLEMENTED",
      dbUniqueEnforcement: "NOT_PROVEN",
      productionRuntime: "NOT_PROVEN",
      phase1CodeContract: "PASS",
      phase1DbUniqueLive: "NOT_PROVEN",

    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
