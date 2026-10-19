import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { readAuditRequestIp } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  cancelCampaignReservation,
  loadCampaignForAction,
  writeLifecycleAudit,
} from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — cancel a queued occurrence (ADM-03).
 * One-shot campaign → occurrence + campaign 「취소됨」(cancelled) — never reverted to draft.
 * Recurring campaign → only this slot is skipped; the series stays active.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ occurrenceId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { occurrenceId } = await ctx.params;
  const id = typeof occurrenceId === "string" ? occurrenceId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data: occ, error } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const campaignId = String((occ as { campaign_id?: string } | null)?.campaign_id ?? "");
  if (!campaignId) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const loaded = await loadCampaignForAction(svc, campaignId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
  }

  const outcome = await cancelCampaignReservation(svc, loaded.loaded, admin.userId, { occurrenceId: id });
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
  }
  await writeLifecycleAudit(svc, outcome, admin.userId, readAuditRequestIp(req.headers));

  return NextResponse.json({
    ok: true,
    occurrence_id: id,
    campaign_status: outcome.toStatus,
  });
}
