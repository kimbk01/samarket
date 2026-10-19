import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  ensureDraftCampaignSendOccurrence,
  resolveActiveOccurrenceForSend,
} from "@/lib/admin/notification-campaigns/campaign-create-service";
import { getCampaignOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import {
  CAMPAIGN_CONTINUABLE_ERRORS,
  claimAdminCampaignManualSend,
  drainNotificationCampaignSendBatches,
  newCampaignSendClaimToken,
  releaseOccurrenceForContinuation,
  stampOccurrenceDueForRecovery,
} from "@/lib/admin/notification-campaigns/claim-scheduled-campaign";
import {
  evaluateOfficialCampaignSendEligibility,
  type CustomerCenterContentSendRow,
} from "@/lib/admin/notification-campaigns/campaign-source-authority";
import {
  readAuditRequestIp,
  writeCampaignAuditLog,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { CAMPAIGN_CLAIM_BLOCKED_STATUSES } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

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

  const { data: campaignRow, error: campaignErr } = await svc
    .from("admin_notification_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (campaignErr || !campaignRow) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  // ADM-09: same block list as the claim RPC (cancelled / ended / paused) + archived campaigns.
  const campaignStatus = String((campaignRow as { status?: string }).status ?? "");
  const archivedAt = (campaignRow as { archived_at?: string | null }).archived_at;
  if (typeof archivedAt === "string" && archivedAt) {
    return NextResponse.json({ ok: false, error: "campaign_archived" }, { status: 409 });
  }
  if ((CAMPAIGN_CLAIM_BLOCKED_STATUSES as readonly string[]).includes(campaignStatus)) {
    return NextResponse.json(
      { ok: false, error: "illegal_status_transition", from: campaignStatus, to: "sending" },
      { status: 409 }
    );
  }
  const sourceEligibility = await evaluateOfficialCampaignSendEligibility(
    {
      type: (campaignRow as { type?: string }).type,
      target_payload: (campaignRow as { target_payload?: unknown }).target_payload,
      deeplink_url: (campaignRow as { deeplink_url?: string | null }).deeplink_url,
      web_url: (campaignRow as { web_url?: string | null }).web_url,
      target_url: (campaignRow as { target_url?: string | null }).target_url,
    },
    async (eventId) => {
      const { data } = await svc
        .from("platform_events")
        .select("status, starts_at, ends_at")
        .eq("id", eventId)
        .maybeSingle();
      if (!data) return null;
      const row = data as { status?: string | null; starts_at?: string | null; ends_at?: string | null };
      return { status: row.status, startsAt: row.starts_at, endsAt: row.ends_at };
    },
    async (contentId) => {
      const { data, error } = await svc
        .from("app_notices")
        .select("is_active, starts_at, ends_at, archived_at, deleted_at")
        .eq("id", contentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CustomerCenterContentSendRow | null) ?? null;
    }
  );
  if (!sourceEligibility.ok) {
    if (sourceEligibility.error === "content_source_lookup_failed") {
      return NextResponse.json(
        { ok: false, error: "content_source_lookup_failed" },
        { status: 503 }
      );
    }
    const sourceErrors = new Set([
      "event_source_missing",
      "event_source_unpublished",
      "event_source_unavailable",
      "content_source_missing",
      "content_source_unavailable",
    ]);
    return NextResponse.json(
      {
        ok: false,
        error: sourceErrors.has(sourceEligibility.error)
          ? sourceEligibility.error
          : "campaign_source_required",
        message:
          sourceEligibility.error === "event_source_unpublished"
            ? "Event must be published before Push can be sent."
            : sourceEligibility.error === "event_source_missing"
              ? "Platform Event source was not found."
              : sourceEligibility.error === "event_source_unavailable"
                ? "Platform Event is not currently available as a Push destination."
                : sourceEligibility.error === "content_source_missing"
                  ? "Bound notice content was not found."
                  : sourceEligibility.error === "content_source_unavailable"
                    ? "Bound notice content must be published (active, in period, not archived/deleted) before it can be sent."
                    : "Official notice/system/marketing campaigns require content bind or approved landing. Legacy unbound campaigns cannot be sent.",
      },
      { status: 400 }
    );
  }

  let body: { idempotency_key?: unknown; single_batch?: unknown; occurrence_id?: unknown; enqueue_only?: unknown } =
    {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const requestedOccurrenceId = typeof body.occurrence_id === "string" ? body.occurrence_id : null;
  let occurrenceId = await resolveActiveOccurrenceForSend(svc, id, requestedOccurrenceId);
  if (!occurrenceId && !requestedOccurrenceId?.trim()) {
    // EVENT-01: draft campaigns get their first occurrence at send time (current content).
    const draft = await ensureDraftCampaignSendOccurrence(svc, {
      campaignId: id,
      adminUserId: admin.userId,
      idempotencyKey: readIdempotencyKey(req, body.idempotency_key) ?? `${id}:${admin.userId}`,
    });
    if (!draft.ok) {
      return NextResponse.json({ ok: false, error: draft.error }, { status: draft.status });
    }
    occurrenceId = draft.occurrenceId;
  }
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

  if (claim.claimed) {
    await stampOccurrenceDueForRecovery(svc, occurrenceId);
    const isResend = String(occurrence.status ?? "") === "failed";
    await writeCampaignAuditLog(svc, {
      actorId: admin.userId,
      campaignId: id,
      action: isResend ? "resend" : "send",
      fromStatus: campaignStatus,
      toStatus: "sending",
      after: {
        occurrence_id: occurrenceId,
        sequence_number: occurrence.sequence_number,
        trigger_type: occurrence.trigger_type,
      },
      targetCount: occurrence.target_member_count ?? null,
      ip: readAuditRequestIp(req.headers),
    });
  }

  const auditSend = (extra: Record<string, unknown>) =>
    appendAdminRouteAudit(svc, req, {
      actorId: admin.userId,
      targetType: "admin_notification_campaign",
      targetId: id,
      action: "notification_campaign.send",
      after: {
        occurrence_id: occurrenceId,
        idempotency_key: idempotencyKey,
        claimed: claim.claimed,
        ...extra,
      },
    });

  if (enqueueOnly) {
    await auditSend({ mode: "enqueue_only" });
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
    await auditSend({
      mode: "single_batch",
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      done: result.done,
    });
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
    if (claim.claimed && CAMPAIGN_CONTINUABLE_ERRORS.has(String(drained.error ?? ""))) {
      await releaseOccurrenceForContinuation(svc, occurrenceId, claimToken, drained.error ?? null);
    }
    return NextResponse.json({ ok: false, error: drained.error ?? "batch_failed" }, { status: 500 });
  }

  if (!drained.done && claim.claimed) {
    // U1-B: remaining targets continue via the existing scheduled dispatcher.
    await releaseOccurrenceForContinuation(svc, occurrenceId, claimToken);
  }

  await auditSend({
    mode: "drain",
    sent: drained.sent,
    skipped: drained.skipped,
    failed: drained.failed,
    done: drained.done,
    batches: drained.batches,
  });

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
    stopped: drained.stopped === true,
  });
}
