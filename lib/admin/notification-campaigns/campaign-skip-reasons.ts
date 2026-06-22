/** Standard skip reasons for campaign delivery audit. */
export const CAMPAIGN_SKIP_REASONS = [
  "policy_filtered",
  "marketing_not_opted_in",
  "notice_disabled",
  "service_disabled",
  "user_setting_blocked",
  "quiet_hours",
  "permission_denied",
  "token_missing",
  "no_active_targets",
  "foreground_no_os_push",
  "channel_in_app_only",
  "channel_push_only_foreground",
  "duplicate_campaign_user",
  "dispatch_disabled",
  "ios_push_image_unsupported",
  "campaign_already_sent",
  "test_only_channel",
] as const;

export type CampaignSkipReason = (typeof CAMPAIGN_SKIP_REASONS)[number];

export function isCampaignSkipReason(value: string): value is CampaignSkipReason {
  return (CAMPAIGN_SKIP_REASONS as readonly string[]).includes(value);
}
