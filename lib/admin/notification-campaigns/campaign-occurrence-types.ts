export const OCCURRENCE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "partially_failed",
  "failed",
  "cancelled",
] as const;

export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const OCCURRENCE_TRIGGER_TYPES = [
  "immediate",
  "scheduled",
  "recurring",
  "recovery",
  "test",
] as const;

export type OccurrenceTriggerType = (typeof OCCURRENCE_TRIGGER_TYPES)[number];

export const CAMPAIGN_SEND_MODES = ["immediate", "scheduled", "recurring"] as const;
export type CampaignSendMode = (typeof CAMPAIGN_SEND_MODES)[number];

export const RECURRENCE_KINDS = ["none", "daily", "weekly", "monthly"] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

export const CAMPAIGN_LIFECYCLE_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "ended",
  "cancelled",
  // legacy execution statuses on campaign row (read-only after cutover)
  "sending",
  "sent",
  "partially_failed",
  "failed",
] as const;

export type CampaignLifecycleStatus = (typeof CAMPAIGN_LIFECYCLE_STATUSES)[number];

import type { AdminNotificationCampaignRow, CampaignChannel } from "@/lib/admin/notification-campaigns/campaign-types";

export type CampaignContentSnapshot = {
  title: string;
  body: string;
  type: AdminNotificationCampaignRow["type"];
  channel: CampaignChannel;
  target_type: string;
  deeplink_url: string | null;
  web_url: string | null;
  push_image_url: string | null;
  in_app_image_url: string | null;
  destination_kind?: "internal" | "external" | "none";
  /** Customer Center Content bind (immutable at send). */
  content_id?: string | null;
  content_type?: string | null;
  canonical_route?: string | null;
};

export type CampaignAudienceSnapshot = {
  target_member_count: number;
  push_eligible_member_count: number;
  push_device_count: number;
  in_app_member_count: number;
  android_devices?: number;
  ios_devices?: number;
  web_devices?: number;
  resolved_at?: string;
};

export type AdminNotificationCampaignOccurrenceRow = {
  id: string;
  campaign_id: string;
  sequence_number: number;
  trigger_type: OccurrenceTriggerType | string;
  scheduled_for: string | null;
  status: OccurrenceStatus | string;
  idempotency_key: string | null;
  send_claim_token: string | null;
  send_claimed_at: string | null;
  send_lease_expires_at: string | null;
  send_progress_offset: number;
  last_error: string | null;
  target_member_count: number;
  push_eligible_member_count: number;
  push_device_count: number;
  in_app_member_count: number;
  push_attempted: number;
  push_sent: number;
  push_skipped: number;
  push_failed: number;
  in_app_attempted: number;
  in_app_sent: number;
  in_app_skipped: number;
  in_app_failed: number;
  content_snapshot: CampaignContentSnapshot | Record<string, unknown>;
  audience_snapshot: CampaignAudienceSnapshot | Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  triggered_by: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OccurrenceChannelMetrics = {
  push_sent: number;
  push_skipped: number;
  push_failed: number;
  push_attempted: number;
  in_app_sent: number;
  in_app_skipped: number;
  in_app_failed: number;
  in_app_attempted: number;
  target_member_count: number;
  push_eligible_member_count: number;
  push_device_count: number;
  in_app_member_count: number;
};
