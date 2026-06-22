import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runNotificationCampaignTestSend } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — test send to selected user IDs (does not change campaign status). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { user_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    : [];

  if (userIds.length === 0) {
    return NextResponse.json({ ok: false, error: "user_ids_required" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const result = await runNotificationCampaignTestSend(svc, id, userIds);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "test_send_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
  });
}
