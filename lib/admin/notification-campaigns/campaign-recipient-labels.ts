/**
 * 받은 사람 창 사유 문구 (Owner 구현 승인 2026-11-02 · 시안 v3) — 서버·화면 공용, 순수 함수.
 * 코드 = `notification_campaign_deliveries.skip_reason` · 실패 상세 = `notification_deliveries.provider_response`.
 */
const SKIP_LABEL: Record<string, [string, string]> = {
  token_missing: ["등록된 기기 없음", "No registered device"],
  no_active_targets: ["등록된 기기 없음", "No registered device"],
  permission_denied: ["기기 알림 권한 꺼짐", "Notifications off on device"],
  // 예전 기록 표시용 — 2026-11-03 이후 서버는 앱 사용 중을 판정하지 않는다(기기가 숨김)
  foreground_no_os_push: ["앱 사용 중 — 앱 안 배너로 표시", "App open — shown in app"],
  voip_reserved_for_call_push: ["iPhone 통화 전용 토큰(다른 토큰으로 발송)", "iPhone call-only token"],
  marketing_not_opted_in: ["혜택·이벤트 수신 미동의", "Not opted in to benefits & events"],
  notice_disabled: ["회원이 공지 알림 끔", "Member turned off notices"],
  service_disabled: ["회원이 전체 알림 끔", "Member turned off notifications"],
  user_setting_blocked: ["회원 알림 설정으로 끔", "Blocked by member setting"],
  quiet_hours: ["방해 금지 시간", "Quiet hours"],
  policy_filtered: ["발송 정책으로 제외", "Filtered by policy"],
  channel_in_app_only: ["알림함만 보내는 알림", "In-app only"],
  channel_push_only_foreground: ["앱 사용 중(푸시 전용)", "App open (push only)"],
  duplicate_campaign_user: ["이미 받은 회원", "Already received"],
  dispatch_disabled: ["푸시 발송 꺼짐(서버)", "Push dispatch off"],
  ios_push_image_unsupported: ["iPhone 이미지 미지원", "iOS image unsupported"],
  campaign_already_sent: ["이미 보낸 알림", "Already sent"],
  test_only_channel: ["테스트 전용", "Test only"],
  event_insert_or_dispatch_failed: ["알림함 저장 실패", "Inbox save failed"],
};

export function campaignSkipReasonLabel(code: string | null | undefined, ko: boolean): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const hit = SKIP_LABEL[c];
  return hit ? (ko ? hit[0] : hit[1]) : c;
}

/** FCM/APNs 실패 응답 → 짧은 사유. */
export function pushFailureLabel(providerResponse: unknown, ko: boolean): string {
  const r = providerResponse && typeof providerResponse === "object" ? (providerResponse as Record<string, unknown>) : null;
  const err = String(r?.error ?? r?.reason ?? r?.code ?? "").trim();
  if (!err) return ko ? "발송 실패" : "Send failed";
  if (/NotRegistered|UNREGISTERED|BadDeviceToken|NOT_FOUND/i.test(err)) {
    return ko ? `${err} — 앱 삭제·토큰 만료 기기` : `${err} — app removed or token expired`;
  }
  return err;
}
