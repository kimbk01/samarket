import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-URL / per-phase run detail for Admin ops (PHASE D). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await ctx.params;
  const runId = id?.trim();
  if (!runId) {
    return NextResponse.json({ ok: false, error: "run_id_required" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  try {
    const { data, error } = await sb
      .from("community_crawl_run_events")
      .select(
        "id,run_id,source_id,board_id,source_post_id,canonical_url,phase,classification,error_code,error_message,http_status,created_at"
      )
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, events: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
