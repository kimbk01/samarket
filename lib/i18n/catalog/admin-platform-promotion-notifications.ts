/**
 * Phase 4 — Promotion Push / Bell operational UX i18n.
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (avoids TS7056 declaration emit growth on the giant admin catalog).
 */

export const adminPlatformPromotionNotificationsMessages = {
  ko: {
    admin_promotion_notifications_save_not_send:
      "이벤트 저장 · 게시 · 배포 저장 · Push 초안 저장만으로는 Push가 발송되지 않습니다. 발송은 「Push 보내기」만 합니다.",
    admin_promotion_push_event_optional: "선택 — 이벤트 없이 독립 캠페인도 가능",
    admin_promotion_push_status_truth:
      "발송 완료 = 엔진 발송 기록 (기기 전달·열람과 동일하지 않음)",
    admin_promotion_push_empty:
      "설정된 Push 알림이 없습니다. 이벤트 노출 설정 또는 Push 초안에서 구성하세요.",
    admin_promotion_bell_event_optional: "선택 — 이벤트 없이 독립 캠페인도 가능",
    admin_promotion_bell_dist_truth:
      "캠페인 초안만 생성 · 회원 알림함 행은 캠페인 등록/발송 시",
    admin_promotion_bell_action_label: "앱 알림함 등록/관리 (Push 「보내기」와 다름)",
    admin_promotion_bell_empty:
      "설정된 앱 알림함 항목이 없습니다. 이벤트 노출 설정에서 켠 뒤 알림 캠페인에서 등록하세요.",
    admin_platform_events_push_manage: "Push 캠페인 관리 · 보내기",
    admin_platform_events_push_source_blocked:
      "Push 발송이 소스 계약에 막혔습니다. 알림 캠페인에서 공식 랜딩/콘텐츠를 확인하세요. 검증을 우회하지 않습니다.",
    admin_platform_events_bell_manage: "앱 알림함 캠페인 등록/관리",
  },
  en: {
    admin_promotion_notifications_save_not_send:
      "Event save, publish, Dist save, and Push draft save never dispatch Push. Only 「Send push」 does.",
    admin_promotion_push_event_optional: "Optional — standalone campaigns allowed",
    admin_promotion_push_status_truth:
      "Sent = engine dispatch record (not proof of device delivery/open)",
    admin_promotion_push_empty:
      "No Push notifications configured. Use Event exposure settings or create a Push draft.",
    admin_promotion_bell_event_optional: "Optional — standalone campaigns allowed",
    admin_promotion_bell_dist_truth:
      "Creates campaign draft only · inbox rows on campaign send/register",
    admin_promotion_bell_action_label: "Register / manage inbox (not the same as Send push)",
    admin_promotion_bell_empty:
      "No inbox items configured. Enable on Event exposure, then register via notification campaigns.",
    admin_platform_events_push_manage: "Manage Push campaign · Send",
    admin_platform_events_push_source_blocked:
      "Push send blocked by campaign source contract. Confirm approved landing/content on the notification campaign. Do not bypass validation.",
    admin_platform_events_bell_manage: "Register / manage inbox campaign",
  },
} as const;
