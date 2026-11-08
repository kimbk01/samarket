/**
 * 받은 사람 창 사유 문구 (Owner 구현 승인 2026-11-02 · 시안 v3) — 서버·화면 공용, 순수 함수.
 * 코드 = `notification_campaign_deliveries.skip_reason` · 실패 상세 = `notification_deliveries.provider_response`.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

const SKIP_LABEL: Record<string, MessageKey> = {
  token_missing: "admin_notification_campaigns_skip_token_missing",
  no_active_targets: "admin_notification_campaigns_skip_no_active_targets",
  // 예전 기록 표시용 — 2026-11-03(R-4) 이후 만들지 않는다
  permission_denied: "admin_notification_campaigns_skip_permission_denied",
  // 예전 기록 표시용 — 2026-11-03 이후 서버는 앱 사용 중을 판정하지 않는다(기기가 숨김)
  foreground_no_os_push: "admin_notification_campaigns_skip_foreground_no_os_push",
  // 발송 단계(dispatch)가 남기는 사유 — 확정 설계 B-5
  server_misconfigured: "admin_notification_campaigns_skip_server_misconfigured",
  notification_event_not_found: "admin_notification_campaigns_skip_notification_event_not_found",
  safety_check_failed: "admin_notification_campaigns_skip_safety_check_failed",
  destination_deleted: "admin_notification_campaigns_skip_destination_deleted",
  destination_forbidden: "admin_notification_campaigns_skip_destination_forbidden",
  event_expired: "admin_notification_campaigns_skip_event_expired",
  already_sent: "admin_notification_campaigns_skip_already_sent",
  delivery_in_flight: "admin_notification_campaigns_skip_delivery_in_flight",
  previous_permanent_failure: "admin_notification_campaigns_skip_previous_permanent_failure",
  delivery_insert_error: "admin_notification_campaigns_skip_delivery_insert_error",
  apns_not_configured: "admin_notification_campaigns_skip_apns_not_configured",
  fcm_not_configured: "admin_notification_campaigns_skip_fcm_not_configured",
  marketing_push_only_missing_approved_route: "admin_notification_campaigns_skip_marketing_push_only_missing_approved",
  send_exception: "admin_notification_campaigns_skip_send_exception",
  voip_reserved_for_call_push: "admin_notification_campaigns_skip_voip_reserved_for_call_push",
  marketing_not_opted_in: "admin_notification_campaigns_skip_marketing_not_opted_in",
  notice_disabled: "admin_notification_campaigns_skip_notice_disabled",
  service_disabled: "admin_notification_campaigns_skip_service_disabled",
  user_setting_blocked: "admin_notification_campaigns_skip_user_setting_blocked",
  quiet_hours: "admin_notification_campaigns_skip_quiet_hours",
  policy_filtered: "admin_notification_campaigns_skip_policy_filtered",
  channel_in_app_only: "admin_notification_campaigns_skip_channel_in_app_only",
  // 예전 기록 표시용 — 만들지 않음
  channel_push_only_foreground: "admin_notification_campaigns_skip_channel_push_only_foreground",
  duplicate_campaign_user: "admin_notification_campaigns_skip_duplicate_campaign_user",
  dispatch_disabled: "admin_notification_campaigns_skip_dispatch_disabled",
  ios_push_image_unsupported: "admin_notification_campaigns_skip_ios_push_image_unsupported",
  campaign_already_sent: "admin_notification_campaigns_skip_campaign_already_sent",
  test_only_channel: "admin_notification_campaigns_skip_test_only_channel",
  event_insert_or_dispatch_failed: "admin_notification_campaigns_skip_event_insert_or_dispatch_failed",
};

export function campaignSkipReasonLabel(code: string | null | undefined, ko: boolean): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const hit = SKIP_LABEL[c];
  return hit ? tx(ko, hit) : c;
}

/** FCM/APNs 실패 응답 → 짧은 사유. */
export function pushFailureLabel(providerResponse: unknown, ko: boolean): string {
  const r = providerResponse && typeof providerResponse === "object" ? (providerResponse as Record<string, unknown>) : null;
  const err = String(r?.error ?? r?.reason ?? r?.code ?? "").trim();
  if (!err) return tx(ko, "admin_notification_campaigns_send_failed");
  if (/NotRegistered|UNREGISTERED|BadDeviceToken|NOT_FOUND/i.test(err)) {
    return tx(ko, "admin_notification_campaigns_app_removed_or_token_expired", { err: String(err) });
  }
  return err;
}
