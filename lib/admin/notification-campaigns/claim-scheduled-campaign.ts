import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNotificationCampaignOccurrenceRow } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import {
  claimDueOccurrence,
  claimOccurrenceSend,
  type ClaimOccurrenceSendResult,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
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
}> {
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

  while (batches < maxBatches && Date.now() - started < maxWallMs) {
    const result = await runNotificationCampaignSendBatch(svc, occurrenceId);
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

  return { ok: true, done, batches, sent, skipped, failed };
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
  });

  const ensured = await ensureCampaignOccurrence(svc, {
    campaignId,
    sequenceNumber: seq,
    triggerType: "recurring",
    scheduledFor: next.toISOString(),
    idempotencyKey: `recurring:${campaignId}:${seq}`,
    campaign: snapshot,
  });

  return ensured.ok ? ensured.occurrence : null;
}
