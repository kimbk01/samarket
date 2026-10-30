import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadCampaignPushFailureBreakdown } from "@/lib/admin/notification-campaigns/campaign-push-failure-breakdown";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — 회차 푸시 실패 원인 (`?occurrence_id=`). 근거 = 발송 기록의 FCM·APNs 응답. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  const occurrenceId = req.nextUrl.searchParams.get("occurrence_id")?.trim() ?? "";
  if (!id || !occurrenceId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id, campaign_id, started_at, completed_at")
    .eq("id", occurrenceId)
    .eq("campaign_id", id)
    .maybeSingle();
  if (!occ) {
    return NextResponse.json({ ok: false, error: "occurrence_not_found" }, { status: 404 });
  }

  const row = occ as { started_at?: string | null; completed_at?: string | null };
  const result = await loadCampaignPushFailureBreakdown(svc, {
    campaignId: id,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...result.breakdown });
}
