/**
 * 알림 항목 SSOT — 알림 1종류 = 항목 1줄 (notification-admin-item-ssot-audit-2026-11-02 §3 · Owner 설계 승인 2026-11-02).
 *
 * 알림음 연결(앱 안·푸시 같은 소리 키)이 이 표 하나를 쓴다. 「알림 항목 관리」 화면·켜기/끄기 판정은 7db335de3 에서
 * 제거했고, 그때 남은 쓰지 않는 필드(묶음·잠금)는 재감사 2026-11-02 W2 에서 지웠다.
 * - 일치 규칙: 저장된 알림 행(type · kind · 수신 역할 · 캠페인 종류 · 미리보기 종류)으로 항목을 정한다.
 * - 알림음: 항목마다 자기 소리 키 1개(다른 항목과 공유하지 않음). 관리자 수신 알림은 관리자 운영 소리를 쓴다.
 * - 종 탭·회원 설정은 기존 단일 함수(`classifyMemberNotificationDomain`·`getNotificationPreferencePolicy`)가 정한다 —
 *   이 표에 같은 값을 다시 적지 않는다(어드민은 실제 행·견본으로 그 함수를 실행해 보여 준다).
 *
 * 새 알림 종류를 만들면 이 표에 넣어야 한다 — `notification-item-registry.test.ts` 가 빠짐·소리 공유를 막는다.
 */

export type NotificationItemAudience = "member" | "owner" | "admin";

/** 항목 판정 입력 — 저장된 알림 행에서 읽는다(`notificationItemInputFromEvent`). */
export type NotificationItemInput = Readonly<{
  eventType: string;
  kind?: string | null;
  receiverRole?: string | null;
  campaignType?: string | null;
  previewKind?: string | null;
  /** 옛 작성 코드의 legacyNotificationType(appendUserNotification 의 notification_type) */
  legacyNotificationType?: string | null;
}>;

export type NotificationItemMatch = Readonly<{
  eventTypes: readonly string[];
  /** 없으면 kind 와 무관(단, 더 구체적인 항목이 먼저 이긴다). `""` = kind 가 없는 행만. */
  kinds?: readonly string[];
  receiverRoles?: readonly string[];
  campaignTypes?: readonly string[];
  previewKinds?: readonly string[];
  legacyNotificationTypes?: readonly string[];
}>;

export type NotificationItemDefinition = Readonly<{
  key: string;
  labelKo: string;
  labelEn: string;
  audience: NotificationItemAudience;
  match: NotificationItemMatch;
  /** 같은 항목의 다른 저장 형태(옛 행 · 앱 안 방 종류에서 나온 kind). */
  alsoMatch?: readonly NotificationItemMatch[];
  /** 알림음 SSOT event_key — 관리자 수신(admin)은 관리자 운영 소리, 테스트 발송은 발송 화면이 정해 null. */
  soundEventKey: string | null;
  /** 운영 발생이 없는(작성 코드 없음) 옛 종류 — 목록에 남기되 표시. */
  legacyOnly?: boolean;
  /** 견본 행 — 테스트·어드민 「회원 설정」 계산용. 첫 견본이 대표. */
  samples: readonly NotificationItemInput[];
}>;

function item(def: NotificationItemDefinition): NotificationItemDefinition {
  return def;
}

export const NOTIFICATION_ITEMS: readonly NotificationItemDefinition[] = [
  // ── 운영 소식 (공지·시스템·업데이트) ───────────────────────────────────────────
  item({
    key: "campaign_notice",
    labelKo: "공지 (관리자 발송)",
    labelEn: "Notice (admin campaign)",
    audience: "member",
    match: { eventTypes: ["notice_published", "admin_notice"], campaignTypes: ["notice"] },
    soundEventKey: "admin_notice_received",
    samples: [{ eventType: "notice_published", campaignType: "notice", previewKind: "admin_campaign" }],
  }),
  item({
    key: "campaign_system",
    labelKo: "시스템 안내 (관리자 발송)",
    labelEn: "System notice (admin campaign)",
    audience: "member",
    match: { eventTypes: ["notice_published", "admin_notice"], campaignTypes: ["system"] },
    soundEventKey: "item_campaign_system",
    samples: [{ eventType: "notice_published", campaignType: "system", previewKind: "admin_campaign" }],
  }),
  item({
    key: "campaign_marketing",
    labelKo: "마케팅·이벤트 (관리자 발송)",
    labelEn: "Marketing (admin campaign)",
    audience: "member",
    match: { eventTypes: ["admin_marketing_banner"], kinds: [""] },
    soundEventKey: "item_campaign_marketing",
    samples: [{ eventType: "admin_marketing_banner", campaignType: "marketing", previewKind: "admin_campaign" }],
  }),
  item({
    key: "app_release",
    labelKo: "업데이트 안내",
    labelEn: "App update notice",
    audience: "member",
    match: { eventTypes: ["admin_notice"], kinds: ["app_release"] },
    soundEventKey: "item_app_release",
    samples: [{ eventType: "admin_notice", kind: "app_release" }],
  }),
  item({
    key: "admin_notice_legacy",
    labelKo: "이전 관리자 공지",
    labelEn: "Admin notice (old)",
    audience: "member",
    match: { eventTypes: ["admin_notice", "notice_published"], kinds: ["", "admin_notice"] },
    soundEventKey: "item_admin_notice_legacy",
    legacyOnly: true,
    samples: [{ eventType: "admin_notice" }],
  }),
  item({
    key: "admin_test",
    labelKo: "테스트 발송",
    labelEn: "Test send",
    audience: "member",
    match: { eventTypes: ["admin_test"] },
    soundEventKey: null,
    samples: [{ eventType: "admin_test", previewKind: "admin_test" }],
  }),

  // ── 주문·배달 (회원) ────────────────────────────────────────────────────────
  item({
    key: "order_status_member",
    labelKo: "주문 진행 상태",
    labelEn: "Order status",
    audience: "member",
    match: {
      eventTypes: ["order_status", "delivery_status"],
      kinds: ["store_order_owner_status", "store_order_auto_completed", "store_order_payment_completed_buyer"],
    },
    soundEventKey: "delivery_order_status_changed_user",
    samples: [
      { eventType: "order_status", kind: "store_order_owner_status" },
      { eventType: "order_status", kind: "store_order_auto_completed" },
      { eventType: "order_status", kind: "store_order_payment_completed_buyer" },
    ],
  }),
  item({
    key: "order_payment_member",
    labelKo: "결제 실패·환불 결과",
    labelEn: "Payment failed · refund result",
    audience: "member",
    match: {
      eventTypes: ["order_status"],
      kinds: ["store_order_payment_failed", "store_order_refund_approved", "store_order_refund_rejected"],
    },
    soundEventKey: "item_order_payment_member",
    samples: [
      { eventType: "order_status", kind: "store_order_payment_failed" },
      { eventType: "order_status", kind: "store_order_refund_approved" },
      { eventType: "order_status", kind: "store_order_refund_rejected" },
    ],
  }),
  item({
    key: "order_review_reply",
    labelKo: "내 리뷰에 사장님 답글",
    labelEn: "Store reply to my review",
    audience: "member",
    match: { eventTypes: ["order_status"], kinds: ["store_review_reply"] },
    // kind 를 넣기 전(~2026-11-02) 작성 형태 — notification_type "review" 로만 구분된다.
    alsoMatch: [{ eventTypes: ["order_status"], kinds: [""], legacyNotificationTypes: ["review"] }],
    soundEventKey: "item_order_review_reply",
    samples: [{ eventType: "order_status", kind: "store_review_reply" }],
  }),
  item({
    key: "user_point_charge_approved",
    labelKo: "포인트 충전 승인·보류",
    labelEn: "Point top-up approved · on hold",
    audience: "member",
    match: { eventTypes: ["order_status"], kinds: ["user_point_charge_approved", "user_point_charge_on_hold"] },
    soundEventKey: "settlement_charge_approved",
    samples: [
      { eventType: "order_status", kind: "user_point_charge_approved" },
      { eventType: "order_status", kind: "user_point_charge_on_hold" },
    ],
  }),
  item({
    key: "user_point_charge_rejected",
    labelKo: "포인트 충전 반려",
    labelEn: "Point top-up rejected",
    audience: "member",
    match: { eventTypes: ["order_status"], kinds: ["user_point_charge_rejected"] },
    soundEventKey: "settlement_charge_rejected",
    samples: [{ eventType: "order_status", kind: "user_point_charge_rejected" }],
  }),

  // ── 거래 ───────────────────────────────────────────────────────────────────
  item({
    key: "trade_offer",
    labelKo: "가격 제안·수락·거절",
    labelEn: "Price offer",
    audience: "member",
    match: { eventTypes: ["trade_status", "community_activity"], kinds: ["trade_offer"] },
    soundEventKey: "trade_offer_received",
    samples: [{ eventType: "trade_status", kind: "trade_offer" }],
  }),
  item({
    key: "trade_completed",
    labelKo: "거래 완료",
    labelEn: "Trade completed",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_completed"] },
    soundEventKey: "trade_completed",
    samples: [{ eventType: "trade_status", kind: "trade_completed" }],
  }),
  item({
    key: "trade_reserved",
    labelKo: "거래 예약 (옛 알림)",
    labelEn: "Trade reserved (legacy)",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_reserved"] },
    soundEventKey: "trade_reserved",
    legacyOnly: true,
    samples: [{ eventType: "trade_status", kind: "trade_reserved" }],
  }),
  item({
    key: "trade_dispute",
    labelKo: "구매자 문제 제기",
    labelEn: "Buyer reported an issue",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_dispute"] },
    soundEventKey: "item_trade_dispute",
    samples: [{ eventType: "trade_status", kind: "trade_dispute" }],
  }),
  item({
    key: "trade_moderation",
    labelKo: "거래글 조치·제재",
    labelEn: "Trade post action · sanction",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_moderation", "trade_sanction"] },
    soundEventKey: "item_trade_moderation",
    samples: [
      { eventType: "trade_status", kind: "trade_moderation" },
      { eventType: "trade_status", kind: "trade_sanction" },
    ],
  }),
  item({
    key: "trade_report_result",
    labelKo: "거래 신고 처리 결과",
    labelEn: "Trade report result",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_report_processed"] },
    soundEventKey: "item_trade_report_result",
    samples: [{ eventType: "trade_status", kind: "trade_report_processed" }],
  }),
  item({
    key: "trade_promotion",
    labelKo: "거래글 상위노출 심사",
    labelEn: "Trade promotion review",
    audience: "member",
    match: { eventTypes: ["trade_status"], kinds: ["trade_promotion_decision"] },
    soundEventKey: "item_trade_promotion",
    samples: [{ eventType: "trade_status", kind: "trade_promotion_decision" }],
  }),

  // ── 커뮤니티 ───────────────────────────────────────────────────────────────
  item({
    key: "community_comment",
    labelKo: "댓글·답글",
    labelEn: "Comment · reply",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_comment"] },
    soundEventKey: "community_comment_received",
    samples: [{ eventType: "community_activity", kind: "community_comment" }],
  }),
  item({
    key: "community_like",
    labelKo: "좋아요",
    labelEn: "Like",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_like"] },
    soundEventKey: "community_like_received",
    samples: [{ eventType: "community_activity", kind: "community_like" }],
  }),
  item({
    key: "community_pinned",
    labelKo: "내 글 상단 고정",
    labelEn: "My post pinned",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_pinned"] },
    soundEventKey: "item_community_pinned",
    samples: [{ eventType: "community_activity", kind: "community_pinned" }],
  }),
  item({
    key: "community_meeting",
    labelKo: "모임 가입 요청·승인·거절·내보내기",
    labelEn: "Meeting join · approval · removal",
    audience: "member",
    match: {
      eventTypes: ["community_activity"],
      kinds: [
        "community_meeting_join_request",
        "community_meeting_approved",
        "community_meeting_rejected",
        "community_meeting_kicked",
        "community_meeting_banned",
      ],
    },
    soundEventKey: "item_community_meeting",
    samples: [
      { eventType: "community_activity", kind: "community_meeting_join_request" },
      { eventType: "community_activity", kind: "community_meeting_approved" },
      { eventType: "community_activity", kind: "community_meeting_rejected" },
      { eventType: "community_activity", kind: "community_meeting_kicked" },
      { eventType: "community_activity", kind: "community_meeting_banned" },
    ],
  }),
  item({
    key: "community_meeting_decision",
    labelKo: "모임 운영 조치 (관리자)",
    labelEn: "Meeting decision (admin)",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_meeting_decision"] },
    soundEventKey: "item_community_meeting_decision",
    samples: [{ eventType: "community_activity", kind: "community_meeting_decision" }],
  }),
  item({
    key: "community_moderation",
    labelKo: "게시글 조치·제재",
    labelEn: "Post action · sanction",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_moderation", "community_sanction"] },
    soundEventKey: "item_community_moderation",
    samples: [
      { eventType: "community_activity", kind: "community_moderation" },
      { eventType: "community_activity", kind: "community_sanction" },
    ],
  }),
  item({
    key: "community_report_result",
    labelKo: "커뮤니티 신고 처리 결과",
    labelEn: "Community report result",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_report_processed"] },
    soundEventKey: "item_community_report_result",
    samples: [{ eventType: "community_activity", kind: "community_report_processed" }],
  }),
  item({
    key: "community_promotion",
    labelKo: "커뮤니티 상위노출 종료",
    labelEn: "Community promotion ended",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["community_promotion_ended"] },
    soundEventKey: "item_community_promotion",
    samples: [{ eventType: "community_activity", kind: "community_promotion_ended" }],
  }),

  // ── 고객센터 ───────────────────────────────────────────────────────────────
  item({
    key: "support_reply",
    labelKo: "고객센터 답변",
    labelEn: "Support reply",
    audience: "member",
    match: { eventTypes: ["support_admin_replied"] },
    soundEventKey: "item_support_reply",
    samples: [{ eventType: "support_admin_replied", previewKind: "support_case" }],
  }),
  item({
    key: "support_case_status",
    labelKo: "고객센터 문의 상태 (해결·재문의)",
    labelEn: "Support case status",
    audience: "member",
    match: {
      eventTypes: [
        "support_case_resolved",
        "support_case_reopened",
        "support_case_created",
        "support_case_assigned",
        "support_customer_replied",
      ],
    },
    soundEventKey: "item_support_case_status",
    samples: [
      { eventType: "support_case_resolved", previewKind: "support_case" },
      { eventType: "support_case_reopened", previewKind: "support_case" },
    ],
  }),
  item({
    key: "admin_note_reply",
    labelKo: "관리자 문의 답변",
    labelEn: "Admin inquiry reply",
    audience: "member",
    match: { eventTypes: ["inquiry_answered"], previewKinds: ["member_admin_note", ""] },
    soundEventKey: "item_admin_note_reply",
    samples: [{ eventType: "inquiry_answered", previewKind: "member_admin_note" }],
  }),
  item({
    key: "admin_inbox_message",
    labelKo: "관리자 쪽지",
    labelEn: "Message from admin",
    audience: "member",
    match: { eventTypes: ["inbox_message_received", "admin_notice"], previewKinds: ["member_admin_note"] },
    soundEventKey: "item_admin_inbox_message",
    samples: [{ eventType: "inbox_message_received", previewKind: "member_admin_note" }],
  }),
  item({
    key: "chat_report_result",
    labelKo: "채팅 신고 처리 결과",
    labelEn: "Chat report result",
    audience: "member",
    match: { eventTypes: ["admin_notice"], kinds: ["chat_report_result"] },
    soundEventKey: "item_chat_report_result",
    samples: [{ eventType: "admin_notice", kind: "chat_report_result" }],
  }),
  item({
    key: "chat_report_sanction",
    labelKo: "채팅 신고 제재",
    labelEn: "Chat report sanction",
    audience: "member",
    match: { eventTypes: ["admin_notice"], kinds: ["chat_report_sanction"] },
    soundEventKey: "item_chat_report_sanction",
    samples: [{ eventType: "admin_notice", kind: "chat_report_sanction" }],
  }),

  // ── 메신저 (종 밖 · 채팅 탭) ──────────────────────────────────────────────────
  item({
    key: "chat_direct",
    labelKo: "1:1 메시지",
    labelEn: "Direct message",
    audience: "member",
    match: { eventTypes: ["chat_message"] },
    soundEventKey: "messenger_direct_message_received",
    samples: [{ eventType: "chat_message" }],
  }),
  item({
    key: "chat_group",
    labelKo: "그룹 메시지",
    labelEn: "Group message",
    audience: "member",
    match: { eventTypes: ["group_message"] },
    // 옛 chat_message 행이 그룹방에서 온 경우(앱 안 meta.kind = 방 종류) — 지금처럼 그룹 소리.
    alsoMatch: [{ eventTypes: ["chat_message"], kinds: ["group_chat"] }],
    soundEventKey: "messenger_group_message_received",
    samples: [{ eventType: "group_message" }],
  }),
  item({
    key: "chat_group_invite",
    labelKo: "그룹 초대",
    labelEn: "Group invite",
    audience: "member",
    match: { eventTypes: ["group_message", "admin_notice"], kinds: ["community_group_invite"] },
    soundEventKey: "item_chat_group_invite",
    samples: [{ eventType: "group_message", kind: "community_group_invite" }],
  }),
  item({
    key: "chat_group_pin",
    labelKo: "그룹 공지 고정",
    labelEn: "Group pin",
    audience: "member",
    match: { eventTypes: ["pin_message"] },
    soundEventKey: "item_chat_group_pin",
    samples: [{ eventType: "pin_message" }],
  }),
  item({
    key: "chat_mention",
    labelKo: "멘션",
    labelEn: "Mention",
    audience: "member",
    match: { eventTypes: ["mention_message"] },
    soundEventKey: "community_mention_received",
    samples: [{ eventType: "mention_message" }],
  }),
  item({
    key: "chat_trade",
    labelKo: "거래 채팅",
    labelEn: "Trade chat",
    audience: "member",
    match: { eventTypes: ["trade_message"] },
    alsoMatch: [{ eventTypes: ["chat_message"], kinds: ["trade_chat"] }],
    soundEventKey: "trade_chat_message_received",
    samples: [{ eventType: "trade_message" }],
  }),
  item({
    key: "chat_store_order_member",
    labelKo: "주문 채팅 (구매자)",
    labelEn: "Order chat (buyer)",
    audience: "member",
    match: { eventTypes: ["store_order_message"], receiverRoles: ["user", "member", ""] },
    alsoMatch: [{ eventTypes: ["chat_message"], kinds: ["store_order_message"] }],
    soundEventKey: "delivery_chat_message_received_user",
    samples: [{ eventType: "store_order_message", kind: "store_order_message", receiverRole: "user" }],
  }),
  item({
    key: "friend_request",
    labelKo: "친구 요청",
    labelEn: "Friend request",
    audience: "member",
    match: { eventTypes: ["community_activity", "admin_notice"], kinds: ["friend_request", "friend_rejected"] },
    soundEventKey: "friend_request_received",
    samples: [{ eventType: "community_activity", kind: "friend_request" }],
  }),
  item({
    key: "friend_accepted",
    labelKo: "친구 수락",
    labelEn: "Friend accepted",
    audience: "member",
    match: { eventTypes: ["community_activity", "admin_notice"], kinds: ["friend_accepted"] },
    soundEventKey: "friend_request_accepted",
    samples: [{ eventType: "community_activity", kind: "friend_accepted" }],
  }),
  item({
    key: "gift_offered",
    labelKo: "상품권 선물 받음",
    labelEn: "Gift certificate received",
    audience: "member",
    match: { eventTypes: ["community_activity"], kinds: ["gift_transfer_offered"] },
    soundEventKey: "item_gift_offered",
    samples: [{ eventType: "community_activity", kind: "gift_transfer_offered" }],
  }),
  item({
    key: "gift_result",
    labelKo: "상품권 선물 수락·거절·취소",
    labelEn: "Gift certificate result",
    audience: "member",
    match: {
      eventTypes: ["community_activity"],
      kinds: ["gift_transfer_accepted", "gift_transfer_rejected", "gift_transfer_cancelled"],
    },
    soundEventKey: "item_gift_result",
    samples: [
      { eventType: "community_activity", kind: "gift_transfer_accepted" },
      { eventType: "community_activity", kind: "gift_transfer_rejected" },
      { eventType: "community_activity", kind: "gift_transfer_cancelled" },
    ],
  }),

  // ── 통화 (통화 변경 규정 — 끄지 못함) ──────────────────────────────────────────
  item({
    key: "call_missed",
    labelKo: "부재중 통화",
    labelEn: "Missed call",
    audience: "member",
    match: { eventTypes: ["missed_call"] },
    soundEventKey: "call_missed",
    samples: [{ eventType: "missed_call", kind: "missed_call" }],
  }),

  // ── 사장님 ─────────────────────────────────────────────────────────────────
  item({
    key: "owner_order_new",
    labelKo: "신규 주문",
    labelEn: "New order",
    audience: "owner",
    match: { eventTypes: ["order_status"], kinds: ["store_order_created", "store_order_payment_completed"] },
    soundEventKey: "delivery_order_created_owner",
    samples: [
      { eventType: "order_status", kind: "store_order_created" },
      { eventType: "order_status", kind: "store_order_payment_completed" },
    ],
  }),
  item({
    key: "owner_order_reminder",
    labelKo: "주문 접수 리마인더",
    labelEn: "Order accept reminder",
    audience: "owner",
    match: {
      eventTypes: ["order_status"],
      kinds: ["store_order_accept_reminder_30s", "store_order_accept_reminder_60s"],
    },
    soundEventKey: "delivery_order_delayed_owner",
    samples: [
      { eventType: "order_status", kind: "store_order_accept_reminder_30s" },
      { eventType: "order_status", kind: "store_order_accept_reminder_60s" },
    ],
  }),
  item({
    key: "owner_order_cancelled",
    labelKo: "주문 취소 (고객 취소·접수 시간 초과)",
    labelEn: "Order cancelled",
    audience: "owner",
    match: {
      eventTypes: ["order_status"],
      kinds: ["store_order_buyer_cancelled", "store_order_accept_timeout_cancelled"],
    },
    soundEventKey: "delivery_order_cancelled_owner",
    samples: [
      { eventType: "order_status", kind: "store_order_buyer_cancelled" },
      { eventType: "order_status", kind: "store_order_accept_timeout_cancelled" },
    ],
  }),
  item({
    key: "owner_order_sold_out",
    labelKo: "품절 처리",
    labelEn: "Sold out",
    audience: "owner",
    match: { eventTypes: ["order_status"], kinds: ["store_order_sold_out"] },
    soundEventKey: "delivery_order_sold_out_owner",
    samples: [{ eventType: "order_status", kind: "store_order_sold_out" }],
  }),
  item({
    key: "owner_refund_requested",
    labelKo: "환불 요청",
    labelEn: "Refund requested",
    audience: "owner",
    match: { eventTypes: ["order_status"], kinds: ["store_order_refund_requested"] },
    soundEventKey: "item_owner_refund_requested",
    samples: [{ eventType: "order_status", kind: "store_order_refund_requested" }],
  }),
  item({
    key: "chat_store_order_owner",
    labelKo: "주문 채팅 (사장님)",
    labelEn: "Order chat (owner)",
    audience: "owner",
    match: { eventTypes: ["store_order_message"], receiverRoles: ["owner"] },
    soundEventKey: "delivery_chat_message_received_owner",
    samples: [{ eventType: "store_order_message", kind: "store_order_message", receiverRole: "owner" }],
  }),
  item({
    key: "owner_store_point",
    labelKo: "매장 포인트 (충전·차감·잔액)",
    labelEn: "Store points",
    audience: "owner",
    match: {
      eventTypes: ["order_status"],
      kinds: [
        "store_point_charge_approved",
        "store_point_charge_rejected",
        "store_point_charge_on_hold",
        "store_point_deducted",
        "store_point_blocked",
        "store_point_low",
        "store_point_account_replied",
      ],
    },
    soundEventKey: "item_owner_store_point",
    legacyOnly: true,
    samples: [
      { eventType: "order_status", kind: "store_point_deducted" },
      { eventType: "order_status", kind: "store_point_charge_approved" },
    ],
  }),
  item({
    key: "owner_ad_status",
    labelKo: "광고 심사·상태",
    labelEn: "Ad review · status",
    audience: "owner",
    match: {
      eventTypes: ["admin_notice", "order_status", "admin_marketing_banner"],
      kinds: [
        "delivery_ad_changes_requested",
        "delivery_ad_approved",
        "delivery_ad_rejected",
        "delivery_ad_paused_admin",
        "delivery_ad_resumed",
        "delivery_ad_terminated",
        "delivery_ad_ended",
        "delivery_ad_admin_message",
      ],
    },
    soundEventKey: "item_owner_ad_status",
    samples: [
      { eventType: "admin_notice", kind: "delivery_ad_approved" },
      { eventType: "admin_notice", kind: "delivery_ad_rejected" },
    ],
  }),
  item({
    key: "owner_ad_cash",
    labelKo: "광고 캐시 충전 결과",
    labelEn: "Ad cash top-up result",
    audience: "owner",
    match: {
      eventTypes: ["admin_notice", "admin_marketing_banner"],
      kinds: ["delivery_ad_business_cash_charge_completed", "delivery_ad_business_cash_charge_rejected"],
    },
    soundEventKey: "item_owner_ad_cash",
    samples: [
      { eventType: "admin_notice", kind: "delivery_ad_business_cash_charge_completed" },
      { eventType: "admin_notice", kind: "delivery_ad_business_cash_charge_rejected" },
    ],
  }),
  item({
    // 재감사 E-1 (2026-11-04) — Coin 출금 반려·지급 완료 알림(`lib/currency/coin-withdrawal-notify.ts`).
    // 이전: 항목이 없어 일반 공지 소리로 울리고 관리자 알림 항목 화면에 안 보였다. 지금 소리는 그대로(시드가 공지 소리를 복사).
    key: "owner_coin_withdrawal",
    labelKo: "Coin 출금 결과",
    labelEn: "Coin withdrawal result",
    audience: "owner",
    match: {
      eventTypes: ["admin_notice"],
      kinds: ["store_coin_withdrawal_rejected", "store_coin_withdrawal_paid"],
    },
    soundEventKey: "item_owner_coin_withdrawal",
    samples: [
      { eventType: "admin_notice", kind: "store_coin_withdrawal_rejected" },
      { eventType: "admin_notice", kind: "store_coin_withdrawal_paid" },
    ],
  }),
  item({
    key: "owner_store_decision",
    labelKo: "매장 심사·운영 조치",
    labelEn: "Store review · admin action",
    audience: "owner",
    match: { eventTypes: ["admin_notice"], kinds: ["admin_store_decision", "admin_store_order_intervention"] },
    soundEventKey: "item_owner_store_decision",
    samples: [
      { eventType: "admin_notice", kind: "admin_store_decision" },
      { eventType: "admin_notice", kind: "admin_store_order_intervention" },
    ],
  }),
  item({
    key: "owner_store_notice",
    labelKo: "매장 운영 공지",
    labelEn: "Store operational notice",
    audience: "owner",
    match: { eventTypes: ["admin_notice"], kinds: ["admin_store_operational_notice"] },
    soundEventKey: "item_owner_store_notice",
    samples: [{ eventType: "admin_notice", kind: "admin_store_operational_notice" }],
  }),
  item({
    key: "owner_inquiry_reply",
    labelKo: "플랫폼 문의 답변 (사장님)",
    labelEn: "Platform inquiry reply (owner)",
    audience: "owner",
    match: { eventTypes: ["inquiry_answered"], previewKinds: ["platform_admin_inquiry"] },
    soundEventKey: "item_owner_inquiry_reply",
    samples: [{ eventType: "inquiry_answered", previewKind: "platform_admin_inquiry", receiverRole: "owner" }],
  }),

  // ── 관리자 수신 (관리자 알림함 · admin_notifications) ─────────────────────────
  item({
    key: "admin_support_customer_replied",
    labelKo: "고객센터 고객 답글 (담당 관리자)",
    labelEn: "Customer replied (assigned admin)",
    audience: "admin",
    match: { eventTypes: ["support_customer_replied"], receiverRoles: ["admin_ops"] },
    soundEventKey: null,
    samples: [{ eventType: "support_customer_replied", receiverRole: "admin_ops" }],
  }),
  item({
    key: "admin_store_core_info_changed",
    labelKo: "매장 주소·위치 변경 (재검증)",
    labelEn: "Store address changed",
    audience: "admin",
    match: { eventTypes: ["store_core_info_changed"], receiverRoles: ["admin_ops"] },
    soundEventKey: null,
    samples: [{ eventType: "store_core_info_changed", receiverRole: "admin_ops" }],
  }),
  item({
    key: "admin_store_application_submitted",
    labelKo: "매장 입점 신청·보완 제출",
    labelEn: "Store application submitted",
    audience: "admin",
    match: { eventTypes: ["store_application_submitted"], receiverRoles: ["admin_ops"] },
    soundEventKey: null,
    samples: [{ eventType: "store_application_submitted", receiverRole: "admin_ops" }],
  }),
  item({
    key: "admin_settlement_exception",
    labelKo: "정산 예외·수수료 검토",
    labelEn: "Settlement exception",
    audience: "admin",
    match: {
      eventTypes: ["settlement_commission_review", "settlement_financial_exception"],
      receiverRoles: ["admin_ops"],
    },
    soundEventKey: null,
    samples: [{ eventType: "settlement_commission_review", receiverRole: "admin_ops" }],
  }),
];

const BY_KEY = new Map(NOTIFICATION_ITEMS.map((i) => [i.key, i]));

export function getNotificationItem(key: string): NotificationItemDefinition | undefined {
  return BY_KEY.get(key);
}

function norm(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 구체성 점수 — 더 많은 조건이 맞는 항목이 이긴다(kind 지정 > type 만). */
function matchScore(m: NotificationItemMatch, input: NotificationItemInput): number {
  const type = norm(input.eventType);
  if (!m.eventTypes.includes(type)) return -1;
  let score = 1;
  if (m.kinds) {
    const kind = norm(input.kind);
    if (!m.kinds.includes(kind)) return -1;
    score += kind ? 4 : 1;
  }
  if (m.receiverRoles) {
    if (!m.receiverRoles.includes(norm(input.receiverRole))) return -1;
    score += 2;
  }
  if (m.campaignTypes) {
    if (!m.campaignTypes.includes(norm(input.campaignType))) return -1;
    score += 3;
  }
  if (m.previewKinds) {
    if (!m.previewKinds.includes(norm(input.previewKind))) return -1;
    score += 3;
  }
  if (m.legacyNotificationTypes) {
    if (!m.legacyNotificationTypes.includes(norm(input.legacyNotificationType))) return -1;
    score += 2;
  }
  return score;
}

/** 저장된 알림 1건 → 항목. 맞는 항목이 없으면 null(테스트가 운영 종류 전부를 맞춘다). */
export function resolveNotificationItem(input: NotificationItemInput): NotificationItemDefinition | null {
  let best: NotificationItemDefinition | null = null;
  let bestScore = -1;
  for (const it of NOTIFICATION_ITEMS) {
    const s = Math.max(matchScore(it.match, input), ...(it.alsoMatch ?? []).map((m) => matchScore(m, input)));
    if (s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** notification_events 행(또는 생성 입력)의 display_payload 에서 항목 판정 입력을 만든다. */
export function notificationItemInputFromEvent(eventType: string, displayPayload: unknown): NotificationItemInput {
  const payload = record(displayPayload);
  const legacyMeta = record(payload?.legacyMeta);
  return {
    eventType,
    kind: text(legacyMeta?.kind) ?? text(payload?.kind),
    receiverRole: text(payload?.receiverRole) ?? text(legacyMeta?.receiverRole),
    campaignType: text(payload?.campaignType),
    previewKind: text(payload?.previewKind),
    legacyNotificationType: text(payload?.legacyNotificationType),
  };
}
