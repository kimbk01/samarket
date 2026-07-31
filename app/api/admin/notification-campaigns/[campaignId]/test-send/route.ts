import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runNotificationCampaignTestSend } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readIdempotencyKey(req: NextRequest, bodyKey: unknown): string | null {
  const header = req.headers.get("idempotency-key")?.trim() || req.headers.get("Idempotency-Key")?.trim();
  if (header) return `test:${header.slice(0, 120)}`;
  if (typeof bodyKey === "string" && bodyKey.trim()) return `test:${bodyKey.trim().slice(0, 120)}`;
  return null;
}

/** POST — test send to selected user IDs (does not change campaign status). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { user_ids?: unknown; idempotency_key?: unknown };
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

  const idempotencyKey =
    readIdempotencyKey(req, body.idempotency_key) ??
    `test:${id}:${admin.userId}:${userIds.slice().sort().join(",")}`;

  const { data: camp } = await svc
    .from("admin_notification_campaigns")
    .select("id, test_send_idempotency_key")
    .eq("id", id)
    .maybeSingle();

  if (!camp) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const prevKey = String((camp as { test_send_idempotency_key?: string | null }).test_send_idempotency_key ?? "");
  if (prevKey && prevKey === idempotencyKey) {
    return NextResponse.json({
      ok: true,
      replay: true,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
  }

  const { error: lockErr } = await svc
    .from("admin_notification_campaigns")
    .update({
      test_send_idempotency_key: idempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .or(`test_send_idempotency_key.is.null,test_send_idempotency_key.neq.${idempotencyKey}`);

  if (lockErr) {
    console.warn("[test-send idempotency]", lockErr.message);
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
