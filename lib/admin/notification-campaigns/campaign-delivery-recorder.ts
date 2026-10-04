import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import { resolveFinalOccurrenceStatus } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import type {
  CampaignDeliveryChannel,
  CampaignDeliveryStatus,
} from "@/lib/admin/notification-campaigns/campaign-types";

export type RecordCampaignDeliveryInput = {
  campaignId: string;
  occurrenceId: string;
  userId: string;
  deviceId?: string | null;
  notificationEventId?: string | null;
  channel: CampaignDeliveryChannel;
  status: CampaignDeliveryStatus;
  skipReason?: CampaignSkipReason | string | null;
  providerMessageId?: string | null;
  sentAt?: string | null;
};

export async function recordCampaignDelivery(
  svc: SupabaseClient,
  input: RecordCampaignDeliveryInput
): Promise<string | null> {
  const now = new Date().toISOString();
  const row = {
    campaign_id: input.campaignId,
    occurrence_id: input.occurrenceId,
    user_id: input.userId,
    device_id: input.deviceId ?? null,
    notification_event_id: input.notificationEventId ?? null,
    channel: input.channel,
    status: input.status,
    skip_reason: input.skipReason ?? null,
    provider_message_id: input.providerMessageId ?? null,
    sent_at: input.sentAt ?? (input.status === "sent" ? now : null),
    updated_at: now,
  };

  const { data, error } = await svc.from("notification_campaign_deliveries").insert(row).select("id").maybeSingle();

  if (error) {
    if (error.message?.includes("duplicate") || error.code === "23505") {
      return null;
    }
    console.warn("[recordCampaignDelivery]", error.message);
    return null;
  }
  return String((data as { id?: string })?.id ?? "") || null;
}

/** Channel-separated occurrence metrics — NOT combined push+in_app sent_count. */
/**
 * `opts.terminal` (U1-B): the batch runner's "no targets remain" decision. When provided it is the
 * only completion signal; legacy callers without it keep the previous pending-targets rule.
 */
export async function refreshOccurrenceMetrics(
  svc: SupabaseClient,
  occurrenceId: string,
  opts?: { terminal?: boolean }
): Promise<void> {
  const { data: rows, error } = await svc
    .from("notification_campaign_deliveries")
    .select("channel, status")
    .eq("occurrence_id", occurrenceId);

  if (error) return;

  let pushSent = 0;
  let pushSkipped = 0;
  let pushFailed = 0;
  let pushAttempted = 0;
  let inAppSent = 0;
  let inAppSkipped = 0;
  let inAppFailed = 0;
  let inAppAttempted = 0;

  for (const r of rows ?? []) {
    const channel = String((r as { channel?: string }).channel ?? "");
    const s = String((r as { status?: string }).status ?? "");
    const isPush = channel === "push";
    const isInApp = channel === "in_app";

    if (isPush) pushAttempted += 1;
    if (isInApp) inAppAttempted += 1;

    if (s === "sent" || s === "opened") {
      if (isPush) pushSent += 1;
      if (isInApp) inAppSent += 1;
    } else if (s === "skipped") {
      if (isPush) pushSkipped += 1;
      if (isInApp) inAppSkipped += 1;
    } else if (s === "failed") {
      if (isPush) pushFailed += 1;
      if (isInApp) inAppFailed += 1;
    }
  }

  const now = new Date().toISOString();

  await svc
    .from("admin_notification_campaign_occurrences")
    .update({
      push_attempted: pushAttempted,
      push_sent: pushSent,
      push_skipped: pushSkipped,
      push_failed: pushFailed,
      in_app_attempted: inAppAttempted,
      in_app_sent: inAppSent,
      in_app_skipped: inAppSkipped,
      in_app_failed: inAppFailed,
      updated_at: now,
    })
    .eq("id", occurrenceId);

  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("campaign_id, status, trigger_type")
    .eq("id", occurrenceId)
    .maybeSingle();

  if (!occ) return;

  const campaignId = String((occ as { campaign_id?: string }).campaign_id ?? "");
  const currentStatus = String((occ as { status?: string }).status ?? "");

  const { count: pendingTargets } = await svc
    .from("admin_notification_campaign_targets")
    .select("id", { count: "exact", head: true })
    .eq("occurrence_id", occurrenceId)
    .eq("status", "pending");

  const isDone =
    currentStatus === "sending" &&
    (typeof opts?.terminal === "boolean" ? opts.terminal : (pendingTargets ?? 0) === 0);

  if (isDone) {
    const finalStatus = resolveFinalOccurrenceStatus(pushFailed, pushSent, inAppFailed, inAppSent);
    await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        status: finalStatus,
        completed_at: now,
        updated_at: now,
      })
      .eq("id", occurrenceId);

    // U1: test occurrences never change campaign status/aggregates.
    const isTestOccurrence = String((occ as { trigger_type?: string }).trigger_type ?? "") === "test";
    if (campaignId && !isTestOccurrence) {
      await syncCampaignAggregateFromOccurrences(svc, campaignId, {
        status: finalStatus,
        push_sent: pushSent,
        push_skipped: pushSkipped,
        push_failed: pushFailed,
        completed_at: now,
      });
    }
  }
}

/**
 * DEF-02: campaign.sent_count must reflect successful delivery on either channel.
 * in_app_only campaigns previously left sent_count=0 because only push_sent was written.
 */
export function resolveCampaignSentCountAggregate(pushSent: number, inAppSent: number): number {
  const push = Number.isFinite(pushSent) ? Math.max(0, pushSent) : 0;
  const inApp = Number.isFinite(inAppSent) ? Math.max(0, inAppSent) : 0;
  return Math.max(push, inApp);
}

async function syncCampaignAggregateFromOccurrences(
  svc: SupabaseClient,
  campaignId: string,
  latest: {
    status: string;
    push_sent: number;
    push_skipped: number;
    push_failed: number;
    completed_at: string;
  }
): Promise<void> {
  const { data: occRow } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("target_member_count, in_app_sent, in_app_skipped, in_app_failed")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: campRow } = await svc
    .from("admin_notification_campaigns")
    .select("send_mode")
    .eq("id", campaignId)
    .maybeSingle();
  // U1: recurring campaigns keep their lifecycle status (active/paused/ended) — scheduler depends on it.
  const isRecurring = String((campRow as { send_mode?: string } | null)?.send_mode ?? "") === "recurring";
  const inAppSent = Number((occRow as { in_app_sent?: number } | null)?.in_app_sent ?? 0);
  const inAppSkipped = Number((occRow as { in_app_skipped?: number } | null)?.in_app_skipped ?? 0);
  const inAppFailed = Number((occRow as { in_app_failed?: number } | null)?.in_app_failed ?? 0);

  await svc
    .from("admin_notification_campaigns")
    .update({
      sent_count: resolveCampaignSentCountAggregate(latest.push_sent, inAppSent),
      skipped_count: Math.max(latest.push_skipped, inAppSkipped),
      failed_count: Math.max(latest.push_failed, inAppFailed),
      target_count: (occRow as { target_member_count?: number } | null)?.target_member_count ?? 0,
      ...(isRecurring ? {} : { status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status) }),
      sent_at: latest.completed_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
}

function mapOccurrenceStatusToLegacyCampaignStatus(status: string): string {
  if (status === "partially_failed") return "partially_failed";
  if (status === "failed") return "failed";
  if (status === "sent") return "sent";
  if (status === "sending") return "sending";
  if (status === "cancelled") return "cancelled";
  return "draft";
}

/** @deprecated use refreshOccurrenceMetrics */
export async function refreshCampaignDeliveryCounts(
  svc: SupabaseClient,
  campaignId: string,
  occurrenceId?: string
): Promise<void> {
  if (occurrenceId) {
    await refreshOccurrenceMetrics(svc, occurrenceId);
    return;
  }
  const { data } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) {
    await refreshOccurrenceMetrics(svc, String(data.id));
  }
}

export async function markCampaignDeliveryOpened(
  svc: SupabaseClient,
  notificationEventId: string
): Promise<void> {
  const now = new Date().toISOString();
  await svc
    .from("notification_campaign_deliveries")
    .update({ status: "opened", opened_at: now, updated_at: now })
    .eq("notification_event_id", notificationEventId)
    .in("status", ["sent", "pending"]);
}

export async function markCampaignDeliveryDismissed(
  svc: SupabaseClient,
  notificationEventId: string
): Promise<void> {
  const now = new Date().toISOString();
  await svc
    .from("notification_campaign_deliveries")
    .update({ status: "dismissed", updated_at: now })
    .eq("notification_event_id", notificationEventId)
    .in("status", ["sent", "pending", "opened"]);
}
