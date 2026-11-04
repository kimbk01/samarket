/**
 * 알림 항목마다 자기 알림음 키를 갖게 하면서(공유 해소) 지금 나는 소리를 바꾸지 않기 위한 시드 표.
 * notification-admin-item-ssot-audit-2026-11-02 §3-3 (Owner 설계 승인 2026-11-02).
 *
 * 운영 실측(2026-11-02, 운영 알림 행 107종 형태 → 기존 해석 함수):
 * - `channelFrom` = 지금 그 알림의 **푸시**가 쓰는 소리 키 → Android 채널(설치된 앱에 이미 있는 채널만 사용).
 * - `mappingFrom` = 지금 그 알림의 **앱 안** 소리 키 → 음원·볼륨·반복·간격(마이그레이션이 운영 값을 그대로 복사).
 * 둘이 다른 곳(상품권 선물: 푸시 「댓글」·앱 안 「1:1 메시지」)은 각각을 그대로 옮겨 지금 동작을 유지한다.
 * 마이그레이션 `20271102030000_notification_item_sound_events.sql` 이 같은 표로 시드한다(테스트가 대조).
 */
import type { NotificationSoundDomain } from "@/lib/notifications/notification-sound-types";

export type NotificationItemSoundSeed = Readonly<{
  eventKey: string;
  labelKo: string;
  labelEn: string;
  domain: NotificationSoundDomain;
  audience: "user" | "owner" | "receiver";
  channelFrom: string;
  mappingFrom: string;
}>;

const seed = (
  eventKey: string,
  labelKo: string,
  labelEn: string,
  domain: NotificationSoundDomain,
  audience: NotificationItemSoundSeed["audience"],
  channelFrom: string,
  mappingFrom: string = channelFrom
): NotificationItemSoundSeed => ({ eventKey, labelKo, labelEn, domain, audience, channelFrom, mappingFrom });

export const NOTIFICATION_ITEM_SOUND_SEEDS: readonly NotificationItemSoundSeed[] = [
  seed("item_campaign_system", "시스템 안내", "System notice", "admin", "user", "admin_notice_received"),
  seed("item_campaign_marketing", "마케팅·이벤트", "Marketing", "admin", "user", "admin_notice_received"),
  seed("item_app_release", "업데이트 안내", "App update notice", "admin", "user", "admin_notice_received"),
  seed("item_admin_notice_legacy", "옛 관리자 공지", "Legacy admin notice", "admin", "user", "admin_notice_received"),
  seed("item_order_payment_member", "결제 실패·환불 결과", "Payment · refund", "delivery_user", "user", "delivery_order_status_changed_user"),
  seed("item_order_review_reply", "리뷰 답글", "Review reply", "delivery_user", "user", "delivery_order_status_changed_user"),
  seed("item_trade_dispute", "구매자 문제 제기", "Buyer issue", "trade", "user", "trade_offer_received"),
  seed("item_trade_moderation", "거래글 조치·제재", "Trade action", "trade", "user", "trade_offer_received"),
  seed("item_trade_report_result", "거래 신고 결과", "Trade report result", "trade", "user", "trade_offer_received"),
  seed("item_trade_promotion", "거래글 홍보 심사", "Trade promotion", "trade", "user", "trade_offer_received"),
  seed("item_community_pinned", "내 글 상단 고정", "Post pinned", "community", "receiver", "community_comment_received"),
  seed("item_community_meeting", "모임 가입·승인·내보내기", "Meeting", "community", "receiver", "community_comment_received"),
  seed("item_community_meeting_decision", "모임 운영 조치", "Meeting decision", "community", "receiver", "community_comment_received"),
  seed("item_community_moderation", "게시글 조치·제재", "Post action", "community", "receiver", "community_comment_received"),
  seed("item_community_report_result", "커뮤니티 신고 결과", "Community report result", "community", "receiver", "community_comment_received"),
  seed("item_community_promotion", "커뮤니티 홍보 종료", "Community promotion", "community", "receiver", "community_comment_received"),
  seed("item_support_reply", "고객센터 답변", "Support reply", "admin", "user", "admin_notice_received"),
  seed("item_support_case_status", "고객센터 문의 상태", "Support case status", "admin", "user", "admin_notice_received"),
  seed("item_admin_note_reply", "관리자 문의 답변", "Admin inquiry reply", "admin", "user", "admin_notice_received"),
  seed("item_admin_inbox_message", "관리자 쪽지", "Message from admin", "admin", "user", "admin_notice_received"),
  seed("item_chat_report_result", "채팅 신고 처리 결과", "Chat report result", "admin", "user", "admin_notice_received"),
  seed("item_chat_report_sanction", "채팅 신고 제재", "Chat report sanction", "admin", "user", "admin_notice_received"),
  seed("item_chat_group_invite", "그룹 초대", "Group invite", "messenger_group", "receiver", "messenger_group_message_received"),
  seed("item_chat_group_pin", "그룹 공지 고정", "Group pin", "messenger_group", "receiver", "messenger_group_message_received"),
  // 실측: 푸시 = 댓글 채널, 앱 안 = 1:1 메시지 음원 — 둘 다 그대로.
  seed("item_gift_offered", "상품권 선물 받음", "Gift received", "messenger_direct", "receiver", "community_comment_received", "messenger_direct_message_received"),
  seed("item_gift_result", "상품권 선물 결과", "Gift result", "messenger_direct", "receiver", "community_comment_received", "messenger_direct_message_received"),
  seed("item_owner_refund_requested", "환불 요청", "Refund requested", "delivery_owner", "owner", "delivery_order_created_owner"),
  // 작성 코드 없음(옛 행). 기존 계약 F9 「사장님 포인트 = 사장님 주문 소리」 그대로.
  seed("item_owner_store_point", "매장 포인트", "Store points", "settlement", "owner", "delivery_order_created_owner"),
  seed("item_owner_ad_status", "광고 심사·상태", "Ad status", "delivery_owner", "owner", "admin_notice_received"),
  seed("item_owner_ad_cash", "광고 캐시 충전 결과", "Ad cash", "delivery_owner", "owner", "admin_notice_received"),
  // 재감사 E-1 — 마이그레이션 20271104160000 (지금 소리 = 공지 소리 그대로).
  seed("item_owner_coin_withdrawal", "Coin 출금 결과", "Coin withdrawal", "settlement", "owner", "admin_notice_received"),
  seed("item_owner_store_decision", "매장 심사·운영 조치", "Store decision", "delivery_owner", "owner", "admin_notice_received"),
  seed("item_owner_store_notice", "매장 운영 공지", "Store notice", "delivery_owner", "owner", "admin_notice_received"),
  seed("item_owner_inquiry_reply", "플랫폼 문의 답변", "Platform inquiry reply", "delivery_owner", "owner", "admin_notice_received"),
];
