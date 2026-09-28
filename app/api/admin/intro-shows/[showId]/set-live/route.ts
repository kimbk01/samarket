import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { setIntroShowLive } from "@/lib/intro-show/admin-store";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ showId: string }> },
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  const { showId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { revisionId?: string };
  const revisionId = String(body.revisionId ?? "").trim();
  if (!revisionId) return NextResponse.json({ ok: false, error: "revision_required" }, { status: 400 });
  const { data: revision } = await sb
    .from("intro_show_revisions")
    .select("id, campaign_id")
    .eq("id", revisionId)
    .eq("campaign_id", showId)
    .maybeSingle();
  if (!revision) return NextResponse.json({ ok: false, error: "revision_missing" }, { status: 404 });
  try {
    const live = await setIntroShowLive(sb, { revisionId, adminUserId: admin.userId });
    return NextResponse.json({ ok: true, revisionId: live.revisionId, liveCount: live.liveCount });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "set_live_failed" },
      { status: 500 },
    );
  }
}
