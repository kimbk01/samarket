import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/platform-popup-campaigns/[campaignId]/audit */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ campaignId: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const { campaignId } = await ctx.params;
  const { data, error } = await sb
    .from("audit_logs")
    .select("id, action, actor_type, actor_id, before_json, after_json, created_at")
    .eq("target_type", "platform_popup_campaign")
    .eq("target_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
