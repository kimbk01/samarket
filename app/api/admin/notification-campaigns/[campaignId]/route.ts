import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["notice", "marketing", "system"]);
const TARGETS = new Set(["all", "selected_users", "segment", "marketing_opt_in", "active_users", "region"]);

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

  const { data: targets } = await svc
    .from("admin_notification_campaign_targets")
    .select("user_id,status,failure_reason,sent_at,updated_at")
    .eq("campaign_id", id);

  const tallies = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of targets ?? []) {
    const s = String((r as { status?: string }).status ?? "");
    if (s === "pending") tallies.pending += 1;
    else if (s === "sent") tallies.sent += 1;
    else if (s === "failed") tallies.failed += 1;
    else if (s === "skipped") tallies.skipped += 1;
  }

  const targetCount = (targets ?? []).length;
  const deliveryLog = (targets ?? [])
    .map((r) => {
      const row = r as {
        user_id?: string;
        status?: string;
        failure_reason?: string | null;
        sent_at?: string | null;
        updated_at?: string | null;
      };
      return {
        userId: String(row.user_id ?? ""),
        status: String(row.status ?? ""),
        failureReason: row.failure_reason ?? null,
        sentAt: row.sent_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    })
    .sort((a, b) => {
      const aa = Date.parse(a.updatedAt ?? a.sentAt ?? "") || 0;
      const bb = Date.parse(b.updatedAt ?? b.sentAt ?? "") || 0;
      return bb - aa;
    })
    .slice(0, 80);

  return NextResponse.json({ ok: true, campaign: camp, targets: tallies, targetCount, deliveryLog });
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
};

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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

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
    if (["draft", "scheduled", "sent", "failed"].includes(s)) patch.status = s;
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  const { data: updated, error } = await svc
    .from("admin_notification_campaigns")
    .update(patch)
    .eq("id", id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!updated?.length) {
    return NextResponse.json({ ok: false, error: "not_draft_or_missing" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
