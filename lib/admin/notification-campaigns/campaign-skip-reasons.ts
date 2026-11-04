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
  // 발송 단계(dispatch)가 남기는 사유 · 회원별 예외 (확정 설계 B-5·B-9 · 최종 감사 L-2) — 라벨은 campaign-recipient-labels
  "server_misconfigured",
  "notification_event_not_found",
  "safety_check_failed",
  "destination_deleted",
  "destination_forbidden",
  "event_expired",
  "already_sent",
  "delivery_in_flight",
  "previous_permanent_failure",
  "delivery_insert_error",
  "apns_not_configured",
  "fcm_not_configured",
  "marketing_push_only_missing_approved_route",
  "send_exception",
] as const;

export type CampaignSkipReason = (typeof CAMPAIGN_SKIP_REASONS)[number];

export function isCampaignSkipReason(value: string): value is CampaignSkipReason {
  return (CAMPAIGN_SKIP_REASONS as readonly string[]).includes(value);
}
