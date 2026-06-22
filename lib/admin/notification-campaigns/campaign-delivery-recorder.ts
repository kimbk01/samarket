import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampaignSkipReason } from "@/lib/admin/notification-campaigns/campaign-skip-reasons";
import type {
  CampaignDeliveryChannel,
  CampaignDeliveryStatus,
} from "@/lib/admin/notification-campaigns/campaign-types";

export type RecordCampaignDeliveryInput = {
  campaignId: string;
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
    console.warn("[recordCampaignDelivery]", error.message);
    return null;
  }
  return String((data as { id?: string })?.id ?? "") || null;
}

export async function refreshCampaignDeliveryCounts(
  svc: SupabaseClient,
  campaignId: string
): Promise<void> {
  const { data: rows, error } = await svc
    .from("notification_campaign_deliveries")
    .select("status")
    .eq("campaign_id", campaignId);

  if (error) return;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of rows ?? []) {
    const s = String((r as { status?: string }).status ?? "");
    if (s === "sent" || s === "opened") sent += 1;
    else if (s === "skipped") skipped += 1;
    else if (s === "failed") failed += 1;
  }

  const { count: targetCount } = await svc
    .from("notification_campaign_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  await svc
    .from("admin_notification_campaigns")
    .update({
      sent_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      target_count: targetCount ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);
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
