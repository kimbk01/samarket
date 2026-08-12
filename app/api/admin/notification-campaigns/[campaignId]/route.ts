import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listCampaignOccurrences } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { data: camp, error } = await svc.from("admin_notification_campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !camp) {
    return NextResponse.json({ ok: false, error: error?.message ?? "not_found" }, { status: error ? 500 : 404 });
  }

  const occurrences = await listCampaignOccurrences(svc, id, 50);
  const latest = occurrences[0] ?? null;

  const occurrenceId = latest?.id;
  let deviceDeliveryLog: Array<Record<string, unknown>> = [];
  if (occurrenceId) {
    const { data: deliveries } = await svc
      .from("notification_campaign_deliveries")
      .select("user_id, device_id, channel, status, skip_reason, provider_message_id, sent_at, opened_at, updated_at")
      .eq("occurrence_id", occurrenceId)
      .order("created_at", { ascending: false })
      .limit(100);
    deviceDeliveryLog = (deliveries ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        userId: String(row.user_id ?? ""),
        deviceId: row.device_id ?? null,
        channel: String(row.channel ?? ""),
        status: String(row.status ?? ""),
        skipReason: row.skip_reason ?? null,
        providerMessageId: row.provider_message_id ?? null,
        sentAt: row.sent_at ?? null,
        openedAt: row.opened_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    });
  }

  const summary = latest
    ? {
        occurrence_id: latest.id,
        status: latest.status,
        target_member_count: latest.target_member_count,
        push_eligible_member_count: latest.push_eligible_member_count,
        push_device_count: latest.push_device_count,
        in_app_member_count: latest.in_app_member_count,
        push_sent: latest.push_sent,
        push_skipped: latest.push_skipped,
        push_failed: latest.push_failed,
        in_app_sent: latest.in_app_sent,
        in_app_skipped: latest.in_app_skipped,
        in_app_failed: latest.in_app_failed,
        scheduled_for: latest.scheduled_for,
        started_at: latest.started_at,
        completed_at: latest.completed_at,
      }
    : null;

  return NextResponse.json({
    ok: true,
    campaign: camp,
    summary,
    occurrences,
    deviceDeliveryLog,
  });
}

type PatchBody = {
  title?: unknown;
  body?: unknown;
  type?: unknown;
  target_type?: unknown;
  target_url?: unknown;
  image_url?: unknown;
  scheduled_at?: unknown | null;
  segment_region_code?: unknown | null;
  status?: unknown;
  send_mode?: unknown;
};

const TYPES = new Set(["notice", "marketing", "system"]);
const TARGETS = new Set(["all", "selected_users", "segment", "marketing_opt_in", "active_users", "region"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: admin.userId,
  };

  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (typeof body.body === "string" && body.body.trim()) patch.body = body.body.trim();
  if (typeof body.type === "string" && TYPES.has(body.type.trim())) patch.type = body.type.trim();
  if (typeof body.target_type === "string" && TARGETS.has(body.target_type.trim())) {
    patch.target_type = body.target_type.trim();
  }
  if (typeof body.target_url === "string") patch.target_url = body.target_url.trim() ? body.target_url.trim() : null;
  if (typeof body.image_url === "string") patch.image_url = body.image_url.trim() ? body.image_url.trim() : null;
  if (body.scheduled_at === null) patch.scheduled_at = null;
  if (typeof body.scheduled_at === "string" && body.scheduled_at.trim()) patch.scheduled_at = body.scheduled_at.trim();
  if (body.segment_region_code === null) patch.segment_region_code = null;
  if (typeof body.segment_region_code === "string" && body.segment_region_code.trim()) {
    patch.segment_region_code = body.segment_region_code.trim().slice(0, 32);
  }
  if (typeof body.status === "string") {
    const s = body.status.trim();
    if (["draft", "scheduled", "active", "paused", "ended", "cancelled"].includes(s)) patch.status = s;
  }
  if (typeof body.send_mode === "string") {
    patch.send_mode = body.send_mode.trim();
  }

  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const { data: updated, error } = await svc
    .from("admin_notification_campaigns")
    .update(patch)
    .eq("id", id)
    .in("status", ["draft", "scheduled", "active", "paused"])
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!updated?.length) {
    return NextResponse.json({ ok: false, error: "not_editable_or_missing" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
