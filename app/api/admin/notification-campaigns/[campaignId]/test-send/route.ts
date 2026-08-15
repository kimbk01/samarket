import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import {
  ensureCampaignOccurrence,
  getNextOccurrenceSequenceNumber,
  newOccurrenceIdempotencyKey,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
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

/** POST — test send to selected user IDs (QA occurrence, does not mutate ops lifecycle). */
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
    .select(
      "id, title, body, type, channel, target_type, deeplink_url, web_url, target_url, target_payload, push_image_url, in_app_image_url, test_send_idempotency_key"
    )
    .eq("id", id)
    .maybeSingle();

  if (!camp) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { campaignRowHasOfficialSource } = await import(
    "@/lib/admin/notification-campaigns/campaign-source-authority"
  );
  if (
    !campaignRowHasOfficialSource({
      type: (camp as { type?: string }).type,
      target_payload: (camp as { target_payload?: unknown }).target_payload,
      deeplink_url: (camp as { deeplink_url?: string | null }).deeplink_url,
      web_url: (camp as { web_url?: string | null }).web_url,
      target_url: (camp as { target_url?: string | null }).target_url,
    })
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "campaign_source_required",
        message:
          "Official notice/system/marketing campaigns require content bind or approved landing.",
      },
      { status: 400 }
    );
  }

  const prevKey = String((camp as { test_send_idempotency_key?: string | null }).test_send_idempotency_key ?? "");
  if (prevKey && prevKey === idempotencyKey) {
    return NextResponse.json({ ok: true, replay: true, sent: 0, skipped: 0, failed: 0 });
  }

  await svc
    .from("admin_notification_campaigns")
    .update({ test_send_idempotency_key: idempotencyKey, is_qa: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  const snapshot = buildCampaignContentSnapshot({
    title: String(camp.title ?? ""),
    body: String(camp.body ?? ""),
    type: camp.type as "notice" | "marketing" | "system",
    channel: camp.channel as "push_only" | "in_app_only" | "push_and_in_app" | "test_only",
    target_type: String(camp.target_type ?? "all"),
    deeplink_url: (camp.deeplink_url as string | null) ?? null,
    web_url: (camp.web_url as string | null) ?? null,
    push_image_url: (camp.push_image_url as string | null) ?? null,
    in_app_image_url: (camp.in_app_image_url as string | null) ?? null,
  });
  const sequenceNumber = await getNextOccurrenceSequenceNumber(svc, id);
  const ensured = await ensureCampaignOccurrence(svc, {
    campaignId: id,
    sequenceNumber,
    triggerType: "test",
    idempotencyKey: newOccurrenceIdempotencyKey(idempotencyKey),
    triggeredBy: admin.userId,
    campaign: snapshot,
  });

  if (!ensured.ok) {
    return NextResponse.json({ ok: false, error: ensured.error }, { status: 500 });
  }

  const result = await runNotificationCampaignTestSend(svc, id, ensured.occurrence.id, userIds);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "test_send_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    occurrence_id: ensured.occurrence.id,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
  });
}
