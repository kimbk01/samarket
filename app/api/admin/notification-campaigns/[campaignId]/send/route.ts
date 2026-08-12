import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { resolveActiveOccurrenceForSend } from "@/lib/admin/notification-campaigns/campaign-create-service";
import { getCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
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
 * POST — claim occurrence atomically then drain batches (async-friendly single round).
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

  let body: { idempotency_key?: unknown; single_batch?: unknown; occurrence_id?: unknown; enqueue_only?: unknown } =
    {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const occurrenceId = await resolveActiveOccurrenceForSend(
    svc,
    id,
    typeof body.occurrence_id === "string" ? body.occurrence_id : null
  );
  if (!occurrenceId) {
    return NextResponse.json({ ok: false, error: "occurrence_not_found" }, { status: 404 });
  }

  const occurrence = await getCampaignOccurrence(svc, occurrenceId);
  if (!occurrence) {
    return NextResponse.json({ ok: false, error: "occurrence_not_found" }, { status: 404 });
  }

  const idempotencyKey = readIdempotencyKey(req, body.idempotency_key) ?? `manual:${occurrenceId}:${admin.userId}`;
  const singleBatch = body.single_batch === true;
  const enqueueOnly = body.enqueue_only === true;
  const claimToken = newCampaignSendClaimToken();

  const claim = await claimAdminCampaignManualSend(svc, occurrenceId, {
    idempotencyKey,
    claimToken,
  });

  if (claim.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (claim.error && !claim.occurrence) {
    return NextResponse.json({ ok: false, error: claim.error }, { status: 500 });
  }

  if (!claim.claimed && claim.alreadyRunning) {
    const status = String(claim.occurrence?.status ?? "");
    if (status === "sent" || status === "partially_failed" || status === "failed") {
      return NextResponse.json({
        ok: true,
        done: true,
        replay: true,
        occurrence_id: occurrenceId,
        status,
        metrics: {
          push_sent: claim.occurrence?.push_sent ?? 0,
          push_skipped: claim.occurrence?.push_skipped ?? 0,
          push_failed: claim.occurrence?.push_failed ?? 0,
          in_app_sent: claim.occurrence?.in_app_sent ?? 0,
        },
      });
    }
    if (claim.occurrence?.idempotency_key && claim.occurrence.idempotency_key !== idempotencyKey) {
      return NextResponse.json({ ok: false, error: "occurrence_already_sending" }, { status: 409 });
    }
  }

  if (!claim.claimed && !claim.alreadyRunning) {
    return NextResponse.json(
      { ok: false, error: "occurrence_not_sendable", status: claim.occurrence?.status },
      { status: 409 }
    );
  }

  if (enqueueOnly) {
    return NextResponse.json({
      ok: true,
      enqueued: true,
      occurrence_id: occurrenceId,
      claimed: claim.claimed,
    });
  }

  if (singleBatch) {
    const { runNotificationCampaignSendBatch } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    const result = await runNotificationCampaignSendBatch(svc, occurrenceId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "batch_failed" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      occurrence_id: occurrenceId,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      done: result.done,
      claimed: claim.claimed,
    });
  }

  const drained = await drainNotificationCampaignSendBatches(svc, occurrenceId, {
    maxBatches: 8,
    maxWallMs: 12_000,
  });

  if (!drained.ok) {
    return NextResponse.json({ ok: false, error: drained.error ?? "batch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    occurrence_id: occurrenceId,
    processed: drained.sent + drained.skipped + drained.failed,
    sent: drained.sent,
    skipped: drained.skipped,
    failed: drained.failed,
    done: drained.done,
    batches: drained.batches,
    claimed: claim.claimed,
    continuing: !drained.done,
  });
}
