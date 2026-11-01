-- 알림 항목마다 자기 알림음 키 (notification-admin-item-ssot-audit-2026-11-02 §3-3 · Owner 설계 승인 2026-11-02).
-- 시드 표 = lib/notifications/notification-item-sound-seeds.ts (테스트가 이 파일과 대조).
-- 지금 나는 소리를 바꾸지 않는다:
--   채널(android_channel_id) = 지금 그 알림 푸시가 쓰는 키(channel_from)의 채널 — 설치된 앱에 이미 있는 채널만.
--   음원·볼륨·반복·간격·진동 = 지금 앱 안 소리 키(mapping_from)의 운영 매핑을 그대로 복사.
-- 이미 있으면 건드리지 않는다(재실행 안전). 기존 키·매핑은 바꾸지 않는다.

WITH seeds(event_key, label_ko, label_en, domain, audience, channel_from, mapping_from) AS (
  VALUES
  ('item_campaign_system', '시스템 안내', 'System notice', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_campaign_marketing', '마케팅·이벤트', 'Marketing', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_app_release', '업데이트 안내', 'App update notice', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_admin_notice_legacy', '옛 관리자 공지', 'Legacy admin notice', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_order_payment_member', '결제 실패·환불 결과', 'Payment · refund', 'delivery_user', 'user', 'delivery_order_status_changed_user', 'delivery_order_status_changed_user'),
  ('item_order_review_reply', '리뷰 답글', 'Review reply', 'delivery_user', 'user', 'delivery_order_status_changed_user', 'delivery_order_status_changed_user'),
  ('item_trade_dispute', '구매자 문제 제기', 'Buyer issue', 'trade', 'user', 'trade_offer_received', 'trade_offer_received'),
  ('item_trade_moderation', '거래글 조치·제재', 'Trade action', 'trade', 'user', 'trade_offer_received', 'trade_offer_received'),
  ('item_trade_report_result', '거래 신고 결과', 'Trade report result', 'trade', 'user', 'trade_offer_received', 'trade_offer_received'),
  ('item_trade_promotion', '거래글 홍보 심사', 'Trade promotion', 'trade', 'user', 'trade_offer_received', 'trade_offer_received'),
  ('item_community_pinned', '내 글 상단 고정', 'Post pinned', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_community_meeting', '모임 가입·승인·내보내기', 'Meeting', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_community_meeting_decision', '모임 운영 조치', 'Meeting decision', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_community_moderation', '게시글 조치·제재', 'Post action', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_community_report_result', '커뮤니티 신고 결과', 'Community report result', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_community_promotion', '커뮤니티 홍보 종료', 'Community promotion', 'community', 'receiver', 'community_comment_received', 'community_comment_received'),
  ('item_support_reply', '고객센터 답변', 'Support reply', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_support_case_status', '고객센터 문의 상태', 'Support case status', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_admin_note_reply', '관리자 문의 답변', 'Admin inquiry reply', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_admin_inbox_message', '관리자 쪽지', 'Message from admin', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_chat_report_result', '채팅 신고 처리 결과', 'Chat report result', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_chat_report_sanction', '채팅 신고 제재', 'Chat report sanction', 'admin', 'user', 'admin_notice_received', 'admin_notice_received'),
  ('item_chat_group_invite', '그룹 초대', 'Group invite', 'messenger_group', 'receiver', 'messenger_group_message_received', 'messenger_group_message_received'),
  ('item_chat_group_pin', '그룹 공지 고정', 'Group pin', 'messenger_group', 'receiver', 'messenger_group_message_received', 'messenger_group_message_received'),
  ('item_gift_offered', '상품권 선물 받음', 'Gift received', 'messenger_direct', 'receiver', 'community_comment_received', 'messenger_direct_message_received'),
  ('item_gift_result', '상품권 선물 결과', 'Gift result', 'messenger_direct', 'receiver', 'community_comment_received', 'messenger_direct_message_received'),
  ('item_owner_refund_requested', '환불 요청', 'Refund requested', 'delivery_owner', 'owner', 'delivery_order_created_owner', 'delivery_order_created_owner'),
  ('item_owner_store_point', '매장 포인트', 'Store points', 'settlement', 'owner', 'delivery_order_created_owner', 'delivery_order_created_owner'),
  ('item_owner_ad_status', '광고 심사·상태', 'Ad status', 'delivery_owner', 'owner', 'admin_notice_received', 'admin_notice_received'),
  ('item_owner_ad_cash', '광고 캐시 충전 결과', 'Ad cash', 'delivery_owner', 'owner', 'admin_notice_received', 'admin_notice_received'),
  ('item_owner_store_decision', '매장 심사·운영 조치', 'Store decision', 'delivery_owner', 'owner', 'admin_notice_received', 'admin_notice_received'),
  ('item_owner_store_notice', '매장 운영 공지', 'Store notice', 'delivery_owner', 'owner', 'admin_notice_received', 'admin_notice_received'),
  ('item_owner_inquiry_reply', '플랫폼 문의 답변', 'Platform inquiry reply', 'delivery_owner', 'owner', 'admin_notice_received', 'admin_notice_received')
)
INSERT INTO public.notification_sound_events (
  event_key, label_ko, label_en, domain, audience, direction, default_asset_id, fallback_event_key,
  android_channel_id, ios_sound_name, vibration_enabled, priority, can_room_mute, enabled, legacy_source
)
SELECT
  s.event_key, s.label_ko, s.label_en, s.domain, s.audience, 'inbound', m.default_asset_id, s.mapping_from,
  c.android_channel_id, m.ios_sound_name, m.vibration_enabled, m.priority, m.can_room_mute, true, NULL
FROM seeds s
JOIN public.notification_sound_events c ON c.event_key = s.channel_from
JOIN public.notification_sound_events m ON m.event_key = s.mapping_from
WHERE NOT EXISTS (SELECT 1 FROM public.notification_sound_events e WHERE e.event_key = s.event_key);

WITH seeds(event_key, mapping_from) AS (
  VALUES
  ('item_campaign_system', 'admin_notice_received'),
  ('item_campaign_marketing', 'admin_notice_received'),
  ('item_app_release', 'admin_notice_received'),
  ('item_admin_notice_legacy', 'admin_notice_received'),
  ('item_order_payment_member', 'delivery_order_status_changed_user'),
  ('item_order_review_reply', 'delivery_order_status_changed_user'),
  ('item_trade_dispute', 'trade_offer_received'),
  ('item_trade_moderation', 'trade_offer_received'),
  ('item_trade_report_result', 'trade_offer_received'),
  ('item_trade_promotion', 'trade_offer_received'),
  ('item_community_pinned', 'community_comment_received'),
  ('item_community_meeting', 'community_comment_received'),
  ('item_community_meeting_decision', 'community_comment_received'),
  ('item_community_moderation', 'community_comment_received'),
  ('item_community_report_result', 'community_comment_received'),
  ('item_community_promotion', 'community_comment_received'),
  ('item_support_reply', 'admin_notice_received'),
  ('item_support_case_status', 'admin_notice_received'),
  ('item_admin_note_reply', 'admin_notice_received'),
  ('item_admin_inbox_message', 'admin_notice_received'),
  ('item_chat_report_result', 'admin_notice_received'),
  ('item_chat_report_sanction', 'admin_notice_received'),
  ('item_chat_group_invite', 'messenger_group_message_received'),
  ('item_chat_group_pin', 'messenger_group_message_received'),
  ('item_gift_offered', 'messenger_direct_message_received'),
  ('item_gift_result', 'messenger_direct_message_received'),
  ('item_owner_refund_requested', 'delivery_order_created_owner'),
  ('item_owner_store_point', 'delivery_order_created_owner'),
  ('item_owner_ad_status', 'admin_notice_received'),
  ('item_owner_ad_cash', 'admin_notice_received'),
  ('item_owner_store_decision', 'admin_notice_received'),
  ('item_owner_store_notice', 'admin_notice_received'),
  ('item_owner_inquiry_reply', 'admin_notice_received')
)
INSERT INTO public.notification_sound_mappings (
  event_key, asset_id, use_device_default, volume, repeat_count, cooldown_seconds, vibration_enabled, priority, enabled
)
SELECT s.event_key, src.asset_id, src.use_device_default, src.volume, src.repeat_count, src.cooldown_seconds,
  src.vibration_enabled, src.priority, src.enabled
FROM seeds s
JOIN public.notification_sound_mappings src ON src.event_key = s.mapping_from
WHERE NOT EXISTS (SELECT 1 FROM public.notification_sound_mappings x WHERE x.event_key = s.event_key);

-- down:
-- DELETE FROM public.notification_sound_mappings WHERE event_key LIKE 'item\_%';
-- DELETE FROM public.notification_sound_events WHERE event_key LIKE 'item\_%';
