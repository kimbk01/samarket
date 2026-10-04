import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignOccurrenceRow } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import {
  claimDueOccurrence,
  claimOccurrenceSend,
  type ClaimOccurrenceSendResult,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type { CustomerCenterContentSendRow } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { randomUUID } from "node:crypto";

export function newCampaignSendClaimToken(): string {
  return randomUUID();
}

/** @deprecated use claimDueOccurrence */
export async function claimDueScheduledCampaign(
  svc: SupabaseClient,
  opts?: { claimToken?: string; now?: string }
) {
  const occurrence = await claimDueOccurrence(svc, opts);
  if (!occurrence) return null;
  const { data } = await svc
    .from("admin_notification_campaigns")
    .select("*")
    .eq("id", occurrence.campaign_id)
    .maybeSingle();
  return data ?? null;
}

export type ClaimManualSendResult = ClaimOccurrenceSendResult & {
  occurrenceId: string | null;
};

/**
 * Claim occurrence for manual/immediate send.
 */
export async function claimAdminCampaignManualSend(
  svc: SupabaseClient,
  occurrenceId: string,
  opts: { idempotencyKey?: string | null; claimToken?: string }
): Promise<ClaimManualSendResult> {
  const result = await claimOccurrenceSend(svc, occurrenceId, opts);
  return { ...result, occurrenceId: result.occurrence?.id ?? occurrenceId };
}

/**
 * Run batch SSOT until done or wall-clock budget exhausted.
 * Revalidates official campaign source (incl. live Event publication) before any batch —
 * same gate as manual send. Scheduled cron must not bypass this.
 */
export async function drainNotificationCampaignSendBatches(
  svc: SupabaseClient,
  occurrenceId: string,
  opts?: { maxBatches?: number; maxWallMs?: number }
): Promise<{
  ok: boolean;
  done: boolean;
  batches: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
  slowestBatchMs?: number;
}> {
  const { getCampaignOccurrence } = await import(
    "@/lib/admin/notification-campaigns/campaign-occurrence-service"
  );
  const { evaluateOfficialCampaignSendEligibility } = await import(
    "@/lib/admin/notification-campaigns/campaign-source-authority"
  );

  const occurrence = await getCampaignOccurrence(svc, occurrenceId);
  if (!occurrence) {
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "occurrence_not_found",
    };
  }

  const { data: campaignRow, error: campaignErr } = await svc
    .from("admin_notification_campaigns")
    .select("id, type, target_payload, deeplink_url, web_url, target_url")
    .eq("id", occurrence.campaign_id)
    .maybeSingle();
  if (campaignErr || !campaignRow) {
    const nowMiss = new Date().toISOString();
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "failed",
        last_error: "campaign_not_found",
        completed_at: nowMiss,
        updated_at: nowMiss,
      })
      .eq("id", occurrenceId);
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "campaign_not_found",
    };
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
      const row = data as {
        status?: string | null;
        starts_at?: string | null;
        ends_at?: string | null;
      };
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
  if (!sourceEligibility.ok && CAMPAIGN_CONTINUABLE_ERRORS.has(sourceEligibility.error)) {
    // Transient lookup failure — leave the occurrence for the caller to release (no terminal write).
    return {
      ok: false,
      done: false,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: sourceEligibility.error,
    };
  }
  if (!sourceEligibility.ok) {
    const now = new Date().toISOString();
    const err = sourceEligibility.error;
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: "failed",
        last_error: err,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", occurrenceId);
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "failed", updated_at: now })
      .eq("id", occurrence.campaign_id)
      .in("status", ["scheduled", "sending"]);
    return {
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: err,
    };
  }

  const { runNotificationCampaignSendBatch } = await import(
    "@/lib/admin/notification-campaigns/run-campaign-send-batch"
  );

  const maxBatches = Math.max(1, Math.min(opts?.maxBatches ?? 40, 200));
  const maxWallMs = Math.max(5_000, Math.min(opts?.maxWallMs ?? 50_000, 120_000));
  const started = Date.now();

  let batches = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let done = false;
  let slowestBatchMs = 0;

  // U1-B: never start a batch that is not expected to finish inside the wall budget
  // (a batch killed by the platform timeout loses its offset and re-runs).
  while (batches < maxBatches && (batches === 0 || Date.now() - started + slowestBatchMs <= maxWallMs)) {
    const batchStarted = Date.now();
    const result = await runNotificationCampaignSendBatch(svc, occurrenceId);
    slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStarted);
    batches += 1;
    if (!result.ok) {
      await svc
        .from("admin_notification_campaign_occurrences")
        .update({
          last_error: result.error ?? "batch_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", occurrenceId);
      return {
        ok: false,
        done: result.done,
        batches,
        sent,
        skipped,
        failed,
        error: result.error,
      };
    }
    sent += result.sent;
    skipped += result.skipped;
    failed += result.failed;
    done = result.done;
    if (done) break;
  }

  return { ok: true, done, batches, sent, skipped, failed, slowestBatchMs };
}

/** Transient batch errors that a later continuation may succeed on. */
export const CAMPAIGN_CONTINUABLE_ERRORS = new Set<string>([
  "target_scan_failed",
  "targets_query_failed",
  "content_source_lookup_failed",
]);

/**
 * U1-B: hand an unfinished occurrence back to the scheduled dispatcher (existing cron + claim RPC).
 * Only the holder of `claimToken` can release; `scheduled_for` keeps its value or becomes now.
 */
export async function releaseOccurrenceForContinuation(
  svc: SupabaseClient,
  occurrenceId: string,
  claimToken: string,
  lastError?: string | null
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("scheduled_for")
    .eq("id", occurrenceId)
    .maybeSingle();
  const { data, error } = await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      status: "queued",
      scheduled_for: (occ as { scheduled_for?: string | null } | null)?.scheduled_for ?? now,
      send_claim_token: null,
      send_claimed_at: null,
      send_lease_expires_at: null,
      ...(lastError ? { last_error: lastError } : {}),
      updated_at: now,
    })
    .eq("id", occurrenceId)
    .eq("status", "sending")
    .eq("send_claim_token", claimToken)
    .select("id");
  return !error && Array.isArray(data) && data.length > 0;
}

/**
 * U1-B: an immediate occurrence claimed by a manual send gets a due time so that, if the
 * request dies, the existing lease reclaim + scheduled cron resume it instead of stranding it.
 */
export async function stampOccurrenceDueForRecovery(svc: SupabaseClient, occurrenceId: string): Promise<void> {
  await svc
    .from("admin_notification_campaign_occurrences")
    .update({ scheduled_for: new Date().toISOString() })
    .eq("id", occurrenceId)
    .is("scheduled_for", null);
}

export async function scheduleNextRecurringOccurrence(
  svc: SupabaseClient,
  campaignId: string
): Promise<AdminNotificationCampaignOccurrenceRow | null> {
  const { data: campaign } = await svc
    .from("admin_notification_campaigns")
    .select(
      "id, title, body, type, channel, target_type, deeplink_url, web_url, push_image_url, in_app_image_url, send_mode, recurrence_kind, recurrence_time, recurrence_timezone, recurrence_start_at, recurrence_end_at, recurrence_max_count, recurrence_weekday, status"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return null;
  const row = campaign as Record<string, unknown>;
  if (String(row.send_mode) !== "recurring" || String(row.status) !== "active") return null;
  if (String(row.recurrence_kind) === "none") return null;

  const { getNextOccurrenceSequenceNumber, ensureCampaignOccurrence } = await import(
    "@/lib/admin/notification-campaigns/campaign-occurrence-service"
  );
  const { computeNextRecurrenceScheduledFor } = await import(
    "@/lib/admin/notification-campaigns/campaign-recurrence"
  );
  const { buildCampaignContentSnapshot } = await import(
    "@/lib/admin/notification-campaigns/campaign-content-snapshot"
  );

  const seq = await getNextOccurrenceSequenceNumber(svc, campaignId);
  const lastSeq = seq - 1;
  const { data: lastOcc } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("scheduled_for, completed_at")
    .eq("campaign_id", campaignId)
    .eq("sequence_number", lastSeq)
    .maybeSingle();

  const after = new Date(
    String((lastOcc as { completed_at?: string; scheduled_for?: string } | null)?.completed_at ??
      (lastOcc as { scheduled_for?: string } | null)?.scheduled_for ??
      row.recurrence_start_at ??
      Date.now())
  );

  const timeLocal = String(row.recurrence_time ?? "09:00").slice(0, 5);
  const next = computeNextRecurrenceScheduledFor(
    {
      kind: String(row.recurrence_kind) as "daily" | "weekly" | "monthly",
      timeLocal,
      timezone: String(row.recurrence_timezone ?? "Asia/Seoul"),
      startAt: String(row.recurrence_start_at ?? new Date().toISOString()),
      endAt: (row.recurrence_end_at as string | null) ?? null,
      maxCount: (row.recurrence_max_count as number | null) ?? null,
      weekday: (row.recurrence_weekday as number | null) ?? null,
    },
    after,
    seq
  );

  if (!next) {
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "ended", updated_at: new Date().toISOString() })
      .eq("id", campaignId);
    return null;
  }

  const snapshot = buildCampaignContentSnapshot({
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    type: row.type as "notice" | "marketing" | "system",
    channel: row.channel as "push_only" | "in_app_only" | "push_and_in_app",
    target_type: String(row.target_type ?? "all"),
    deeplink_url: (row.deeplink_url as string | null) ?? null,
    web_url: (row.web_url as string | null) ?? null,
    push_image_url: (row.push_image_url as string | null) ?? null,
    in_app_image_url: (row.in_app_image_url as string | null) ?? null,
    target_payload:
      row.target_payload && typeof row.target_payload === "object"
        ? (row.target_payload as Record<string, unknown>)
        : null,
  });

  const ensured = await ensureCampaignOccurrence(svc, {
    campaignId,
    sequenceNumber: seq,
    triggerType: "recurring",
    scheduledFor: next.toISOString(),
    idempotencyKey: `recurring:${campaignId}:${seq}`,
    campaign: snapshot,
  });

  // Only a freshly created (queued) occurrence re-arms targets; an existing row returned by the
  // idempotent RPC must not touch target state.
  if (ensured.ok && ensured.occurrence.status === "queued" && String(row.target_type) === "selected_users") {
    // U1-B: recurring selected-users occurrences reuse the campaign's existing target rows
    // (one row per campaign+user) — only rows still bound to an earlier occurrence are re-armed.
    await svc
      .from("admin_notification_campaign_targets")
      .update({
        occurrence_id: ensured.occurrence.id,
        status: "pending",
        failure_reason: null,
        skip_reason: null,
        notification_event_id: null,
        sent_at: null,
      })
      .eq("campaign_id", campaignId)
      .neq("occurrence_id", ensured.occurrence.id);
  }

  return ensured.ok ? ensured.occurrence : null;
}
