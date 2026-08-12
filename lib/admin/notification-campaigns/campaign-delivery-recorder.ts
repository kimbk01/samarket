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
export async function refreshOccurrenceMetrics(svc: SupabaseClient, occurrenceId: string): Promise<void> {
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
    .select("campaign_id, status")
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

  const isDone = (pendingTargets ?? 0) === 0 && currentStatus === "sending";

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

    if (campaignId) {
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
    .select("target_member_count, in_app_sent")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  await svc
    .from("admin_notification_campaigns")
    .update({
      sent_count: latest.push_sent,
      skipped_count: latest.push_skipped,
      failed_count: latest.push_failed,
      target_count: (occRow as { target_member_count?: number } | null)?.target_member_count ?? 0,
      status: mapOccurrenceStatusToLegacyCampaignStatus(latest.status),
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
