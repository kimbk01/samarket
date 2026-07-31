import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  claimAdminCampaignManualSend,
  drainNotificationCampaignSendBatches,
  newCampaignSendClaimToken,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function readIdempotencyKey(req: NextRequest, bodyKey: unknown): string | null {
  const header = req.headers.get("idempotency-key")?.trim() || req.headers.get("Idempotency-Key")?.trim();
  if (header) return header.slice(0, 128);
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim().slice(0, 128);
  return null;
}

/**
 * POST — claim campaign atomically then drain batches (or one batch if `single_batch`).
 * Idempotent: same Idempotency-Key while sending/sent returns existing progress.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
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

  let body: { idempotency_key?: unknown; single_batch?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const idempotencyKey = readIdempotencyKey(req, body.idempotency_key) ?? `manual:${id}:${admin.userId}`;
  const singleBatch = body.single_batch === true;
  const claimToken = newCampaignSendClaimToken();

  const claim = await claimAdminCampaignManualSend(svc, id, {
    idempotencyKey,
    claimToken,
  });

  if (claim.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (claim.error && !claim.campaign) {
    return NextResponse.json({ ok: false, error: claim.error }, { status: 500 });
  }

  if (claim.campaign && String(claim.campaign.target_type) === "segment") {
    await svc
      .from("admin_notification_campaigns")
      .update({
        status: "failed",
        last_error: "segment_unsupported",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return NextResponse.json(
      {
        ok: false,
        error: "segment_unsupported",
        message: "Segment targeting is not supported yet.",
      },
      { status: 400 }
    );
  }

  if (!claim.claimed && claim.alreadyRunning) {
    const status = String(claim.campaign?.status ?? "");
    if (status === "sent" || status === "partially_failed" || status === "failed") {
      return NextResponse.json({
        ok: true,
        done: true,
        replay: true,
        status,
        processed: 0,
        sent: claim.campaign?.sent_count ?? 0,
        skipped: claim.campaign?.skipped_count ?? 0,
        failed: claim.campaign?.failed_count ?? 0,
      });
    }
    // Still sending — allow drain continuation for same idempotency key
    if (claim.campaign?.send_idempotency_key && claim.campaign.send_idempotency_key !== idempotencyKey) {
      return NextResponse.json({ ok: false, error: "campaign_already_sending" }, { status: 409 });
    }
  }

  if (!claim.claimed && !claim.alreadyRunning) {
    return NextResponse.json(
      { ok: false, error: "campaign_not_sendable", status: claim.campaign?.status },
      { status: 409 }
    );
  }

  if (singleBatch) {
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    const result = await runNotificationCampaignSendBatch(svc, id);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "batch_failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      done: result.done,
      claimed: claim.claimed,
    });
  }

  const drained = await drainNotificationCampaignSendBatches(svc, id, {
    maxBatches: 40,
    maxWallMs: 50_000,
  });

  if (!drained.ok) {
    return NextResponse.json({ ok: false, error: drained.error ?? "batch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    processed: drained.sent + drained.skipped + drained.failed,
    sent: drained.sent,
    skipped: drained.skipped,
    failed: drained.failed,
    done: drained.done,
    batches: drained.batches,
    claimed: claim.claimed,
  });
}
