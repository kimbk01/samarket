/**
 * W2 고정 픽스처 — 운영 DB notification 형태 116종(§22.1, 2026-10-06 읽기 전용 감사).
 * E = notification_events 형태 87종, N = notifications(레거시) 형태 29종.
 * before = W2 이전 인앱(포그라운드) 결정 키, expected = W2 이후 기대 키(인앱 = 푸시).
 * 운영 발생 건수(n)는 참고용이며 판정에 사용하지 않는다.
 */

export type W2EventShape = {
  type: string;
  category: string;
  lnt: string;
  lpk: string;
  kind: string;
  role: string;
  ldom: string;
  rk: string;
  ct: string;
  n: number;
  before: string;
  expected: string;
};

export type W2LegacyShape = {
  nt: string;
  dom: string;
  kind: string;
  pk: string;
  n: number;
  before: string;
  expected: string;
};

export const W2_EVENT_SHAPES: readonly W2EventShape[] = [
  { type: "chat_message", category: "chat_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "direct", ct: "", n: 1453, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "missed_call", category: "missed_call", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 835, before: "call_missed", expected: "call_missed" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "store_order_owner_status", role: "", ldom: "order", rk: "", ct: "", n: 453, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { type: "order_status", category: "order_status", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 396, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "admin_notice", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "notice", n: 391, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "admin_notice", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 315, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "trade_message", category: "trade_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "trade", ct: "", n: 302, before: "trade_chat_message_received", expected: "trade_chat_message_received" },
  { type: "notice_published", category: "notice_published", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "notice", n: 293, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "chat_message", category: "chat_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "group", ct: "", n: 282, before: "messenger_group_message_received", expected: "messenger_group_message_received" },
  { type: "chat_message", category: "chat", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "direct", ct: "", n: 239, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "store_order_message", category: "order_status", lnt: "", lpk: "", kind: "store_order_message", role: "owner", ldom: "", rk: "store_order", ct: "", n: 182, before: "delivery_chat_message_received_owner", expected: "delivery_chat_message_received_owner" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_created", role: "", ldom: "store", rk: "", ct: "", n: 174, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "admin_notice", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "system", n: 151, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "community_activity", category: "community_activity", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 128, before: "system_default", expected: "community_comment_received" },
  { type: "group_message", category: "group_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "group", ct: "", n: 126, before: "messenger_group_message_received", expected: "messenger_group_message_received" },
  { type: "store_order_message", category: "order_status", lnt: "", lpk: "", kind: "store_order_message", role: "user", ldom: "", rk: "store_order", ct: "", n: 114, before: "delivery_chat_message_received_user", expected: "delivery_chat_message_received_user" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_point_deducted", role: "", ldom: "store", rk: "", ct: "", n: 92, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "admin_notice", category: "admin_notice", lnt: "system", lpk: "", kind: "friend_request", role: "", ldom: "", rk: "", ct: "", n: 76, before: "friend_request_received", expected: "friend_request_received" },
  { type: "trade_status", category: "trade_status", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 71, before: "system_default", expected: "trade_offer_received" },
  { type: "group_message", category: "group", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 54, before: "system_default", expected: "messenger_group_message_received" },
  { type: "community_activity", category: "community_activity", lnt: "chat", lpk: "community", kind: "gift_transfer_offered", role: "", ldom: "community_chat", rk: "", ct: "", n: 48, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "trade_status", category: "trade_status", lnt: "status", lpk: "", kind: "trade_offer", role: "", ldom: "", rk: "", ct: "", n: 38, before: "trade_offer_received", expected: "trade_offer_received" },
  { type: "trade_status", category: "trade_status", lnt: "status", lpk: "", kind: "trade_completed", role: "", ldom: "trade_chat", rk: "", ct: "", n: 37, before: "trade_completed", expected: "trade_completed" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "store_order_owner_status", role: "", ldom: "", rk: "", ct: "", n: 35, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { type: "admin_marketing_banner", category: "admin_marketing_banner", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "marketing", n: 34, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "trade_status", category: "trade_status", lnt: "", lpk: "", kind: "trade_offer", role: "", ldom: "", rk: "", ct: "", n: 32, before: "trade_offer_received", expected: "trade_offer_received" },
  { type: "support_case_created", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 27, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "chat_message", category: "chat", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 26, before: "system_default", expected: "messenger_direct_message_received" },
  { type: "support_admin_replied", category: "inquiry_answered", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 26, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_buyer_cancelled", role: "", ldom: "", rk: "", ct: "", n: 24, before: "delivery_order_cancelled_owner", expected: "delivery_order_cancelled_owner" },
  { type: "missed_call", category: "missed_call", lnt: "system", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 23, before: "call_missed", expected: "call_missed" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_sold_out", role: "", ldom: "store", rk: "", ct: "", n: 22, before: "delivery_order_sold_out_owner", expected: "delivery_order_sold_out_owner" },
  { type: "community_activity", category: "community_activity", lnt: "status", lpk: "", kind: "trade_offer", role: "", ldom: "", rk: "", ct: "", n: 21, before: "trade_offer_received", expected: "trade_offer_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_buyer_cancelled", role: "", ldom: "store", rk: "", ct: "", n: 20, before: "delivery_order_cancelled_owner", expected: "delivery_order_cancelled_owner" },
  { type: "community_activity", category: "community_activity", lnt: "report", lpk: "community", kind: "community_comment", role: "", ldom: "community_chat", rk: "", ct: "", n: 20, before: "community_comment_received", expected: "community_comment_received" },
  { type: "support_case_resolved", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 19, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_refund_requested", role: "", ldom: "store", rk: "", ct: "", n: 17, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "store_order_refund_approved", role: "", ldom: "order", rk: "", ct: "", n: 17, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { type: "admin_notice", category: "admin_notice", lnt: "system", lpk: "", kind: "friend_accepted", role: "", ldom: "", rk: "", ct: "", n: 15, before: "friend_request_accepted", expected: "friend_request_accepted" },
  { type: "order_status", category: "order_status", lnt: "", lpk: "", kind: "store_order_created", role: "", ldom: "", rk: "", ct: "", n: 14, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "community_activity", category: "community_activity", lnt: "report", lpk: "community", kind: "community_like", role: "", ldom: "community_chat", rk: "", ct: "", n: 14, before: "community_like_received", expected: "community_like_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_created", role: "", ldom: "", rk: "", ct: "", n: 13, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "support_case_assigned", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 12, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "store_order_message", category: "order_status", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "store_order", ct: "", n: 12, before: "delivery_chat_message_received_user", expected: "delivery_chat_message_received_user" },
  { type: "pin_message", category: "group_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 12, before: "system_default", expected: "messenger_group_message_received" },
  { type: "inbox_message_received", category: "inbox_message_received", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "system", n: 11, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "community_activity", category: "community_activity", lnt: "chat", lpk: "community", kind: "gift_transfer_accepted", role: "", ldom: "community_chat", rk: "", ct: "", n: 11, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "trade_status", category: "trade_status", lnt: "", lpk: "", kind: "trade_completed", role: "", ldom: "", rk: "", ct: "", n: 10, before: "trade_completed", expected: "trade_completed" },
  { type: "admin_marketing_banner", category: "admin_marketing_banner", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 10, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "chat_message", category: "chat_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 10, before: "system_default", expected: "messenger_direct_message_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_point_deducted", role: "", ldom: "", rk: "", ct: "", n: 9, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { type: "group_message", category: "group_message", lnt: "system", lpk: "", kind: "community_group_invite", role: "", ldom: "", rk: "", ct: "", n: 9, before: "messenger_group_message_received", expected: "messenger_group_message_received" },
  { type: "trade_status", category: "trade_status", lnt: "trade_status", lpk: "", kind: "trade_status", role: "", ldom: "", rk: "", ct: "", n: 9, before: "trade_offer_received", expected: "trade_offer_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "user_point_charge_approved", role: "", ldom: "", rk: "", ct: "", n: 7, before: "settlement_charge_approved", expected: "settlement_charge_approved" },
  { type: "inquiry_answered", category: "inquiry_answered", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "system", n: 6, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "support_customer_replied", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 6, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "", lpk: "", kind: "store_order_owner_status", role: "", ldom: "", rk: "", ct: "", n: 6, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { type: "community_activity", category: "community_activity", lnt: "chat", lpk: "community", kind: "gift_transfer_rejected", role: "", ldom: "community_chat", rk: "", ct: "", n: 5, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_approved", role: "", ldom: "", rk: "", ct: "", n: 5, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "notice_published", category: "notice_published", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "system", n: 4, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "community_activity", category: "community_activity", lnt: "report", lpk: "community", kind: "community_like", role: "", ldom: "", rk: "", ct: "", n: 4, before: "community_like_received", expected: "community_like_received" },
  { type: "chat_message", category: "chat_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "store_order", ct: "", n: 4, before: "delivery_chat_message_received_user", expected: "delivery_chat_message_received_user" },
  { type: "admin_notice", category: "admin_notice", lnt: "system", lpk: "notice", kind: "admin_store_operational_notice", role: "", ldom: "store", rk: "", ct: "", n: 4, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "inquiry_answered", category: "inquiry_answered", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 4, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_rejected", role: "", ldom: "", rk: "", ct: "", n: 4, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_ended", role: "", ldom: "", rk: "", ct: "", n: 3, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "community_activity", category: "community_activity", lnt: "report", lpk: "community", kind: "community_comment", role: "", ldom: "", rk: "", ct: "", n: 3, before: "community_comment_received", expected: "community_comment_received" },
  { type: "trade_status", category: "trade_status", lnt: "status", lpk: "", kind: "trade_completed", role: "", ldom: "", rk: "", ct: "", n: 3, before: "trade_completed", expected: "trade_completed" },
  { type: "group_message", category: "group_message", lnt: "system", lpk: "", kind: "community_group_invite", role: "", ldom: "community_chat", rk: "", ct: "", n: 3, before: "messenger_group_message_received", expected: "messenger_group_message_received" },
  { type: "community_activity", category: "community_activity", lnt: "chat", lpk: "community", kind: "gift_transfer_cancelled", role: "", ldom: "community_chat", rk: "", ct: "", n: 3, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_order_sold_out", role: "", ldom: "", rk: "", ct: "", n: 3, before: "delivery_order_sold_out_owner", expected: "delivery_order_sold_out_owner" },
  { type: "support_case_reopened", category: "admin_notice", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 3, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "admin_marketing_banner", category: "admin_marketing_banner", lnt: "system", lpk: "marketing", kind: "delivery_ad_rejected", role: "", ldom: "", rk: "", ct: "", n: 2, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "", kind: "store_point_charge_approved", role: "", ldom: "store", rk: "", ct: "", n: 2, before: "settlement_charge_approved", expected: "settlement_charge_approved" },
  { type: "trade_message", category: "trade", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "trade", ct: "", n: 2, before: "trade_chat_message_received", expected: "trade_chat_message_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "store_order_payment_failed", role: "", ldom: "order", rk: "", ct: "", n: 2, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_changes_requested", role: "", ldom: "", rk: "", ct: "", n: 2, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "pin_message", category: "group", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 2, before: "system_default", expected: "messenger_group_message_received" },
  { type: "community_activity", category: "community_activity", lnt: "", lpk: "", kind: "trade_offer", role: "", ldom: "", rk: "", ct: "", n: 1, before: "trade_offer_received", expected: "trade_offer_received" },
  { type: "admin_marketing_banner", category: "admin_marketing_banner", lnt: "system", lpk: "marketing", kind: "delivery_ad_approved", role: "", ldom: "", rk: "", ct: "", n: 1, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_paused_admin", role: "", ldom: "", rk: "", ct: "", n: 1, before: "system_default", expected: "delivery_order_status_changed_user" },
  { type: "mention_message", category: "group_message", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "group", ct: "", n: 1, before: "messenger_group_message_received", expected: "community_mention_received" },
  { type: "inbox_message_received", category: "inbox_message_received", lnt: "", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 1, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "notice_published", category: "notice_published", lnt: "", lpk: "", kind: "admin_notice", role: "", ldom: "", rk: "", ct: "", n: 1, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "admin_notice", category: "admin_notice", lnt: "system", lpk: "", kind: "", role: "", ldom: "", rk: "", ct: "", n: 1, before: "admin_notice_received", expected: "admin_notice_received" },
  { type: "order_status", category: "order_status", lnt: "review", lpk: "delivery", kind: "", role: "", ldom: "store", rk: "", ct: "", n: 1, before: "delivery_chat_message_received_owner", expected: "delivery_chat_message_received_owner" },
  { type: "order_status", category: "order_status", lnt: "commerce", lpk: "delivery", kind: "delivery_ad_resumed", role: "", ldom: "", rk: "", ct: "", n: 1, before: "system_default", expected: "delivery_order_status_changed_user" },
];

export const W2_LEGACY_SHAPES: readonly W2LegacyShape[] = [
  { nt: "chat", dom: "community_chat", kind: "community_chat", pk: "", n: 2652, before: "messenger_direct_message_received", expected: "messenger_direct_message_received" },
  { nt: "commerce", dom: "order", kind: "store_order_owner_status", pk: "", n: 1708, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { nt: "commerce", dom: "order", kind: "store_order_owner_status", pk: "delivery", n: 710, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { nt: "commerce", dom: "store", kind: "store_order_created", pk: "", n: 595, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "commerce", dom: "store", kind: "store_point_deducted", pk: "", n: 382, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "system", dom: "community_chat", kind: "friend_request", pk: "", n: 107, before: "friend_request_received", expected: "friend_request_received" },
  { nt: "system", dom: "community_chat", kind: "friend_accepted", pk: "", n: 83, before: "friend_request_accepted", expected: "friend_request_accepted" },
  { nt: "status", dom: "", kind: "", pk: "", n: 64, before: "system_default", expected: "system_default" },
  { nt: "report", dom: "community_chat", kind: "community_like", pk: "community", n: 63, before: "community_like_received", expected: "community_like_received" },
  { nt: "report", dom: "community_chat", kind: "community_comment", pk: "community", n: 56, before: "community_comment_received", expected: "community_comment_received" },
  { nt: "system", dom: "community_chat", kind: "community_group_invite", pk: "", n: 29, before: "messenger_group_message_received", expected: "messenger_group_message_received" },
  { nt: "status", dom: "", kind: "trade_offer", pk: "", n: 25, before: "trade_offer_received", expected: "trade_offer_received" },
  { nt: "status", dom: "trade_chat", kind: "trade_completed", pk: "", n: 21, before: "trade_completed", expected: "trade_completed" },
  { nt: "commerce", dom: "store", kind: "store_order_buyer_cancelled", pk: "", n: 20, before: "delivery_order_cancelled_owner", expected: "delivery_order_cancelled_owner" },
  { nt: "commerce", dom: "", kind: "store_order_owner_status", pk: "", n: 19, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { nt: "status", dom: "trade_chat", kind: "trade_reserved", pk: "", n: 12, before: "trade_reserved", expected: "trade_reserved" },
  { nt: "chat", dom: "", kind: "", pk: "", n: 6, before: "system_default", expected: "system_default" },
  { nt: "commerce", dom: "store", kind: "store_point_blocked", pk: "", n: 5, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "commerce", dom: "", kind: "store_order_created", pk: "", n: 5, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "commerce", dom: "store", kind: "store_point_account_replied", pk: "", n: 5, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "system", dom: "community_chat", kind: "friend_rejected", pk: "", n: 3, before: "admin_notice_received", expected: "admin_notice_received" },
  { nt: "review", dom: "store", kind: "", pk: "delivery", n: 3, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { nt: "chat", dom: "trade_chat", kind: "trade_chat", pk: "", n: 2, before: "trade_chat_message_received", expected: "trade_chat_message_received" },
  { nt: "commerce", dom: "store", kind: "store_order_refund_requested", pk: "", n: 2, before: "delivery_order_created_owner", expected: "delivery_order_created_owner" },
  { nt: "commerce", dom: "", kind: "store_order_sold_out", pk: "", n: 1, before: "delivery_order_sold_out_owner", expected: "delivery_order_sold_out_owner" },
  { nt: "commerce", dom: "order", kind: "store_order_payment_completed_buyer", pk: "", n: 1, before: "delivery_order_status_changed_user", expected: "delivery_order_status_changed_user" },
  { nt: "commerce", dom: "", kind: "store_point_charge_approved", pk: "", n: 1, before: "settlement_charge_approved", expected: "settlement_charge_approved" },
  { nt: "commerce", dom: "store", kind: "store_point_charge_approved", pk: "", n: 1, before: "settlement_charge_approved", expected: "settlement_charge_approved" },
  { nt: "report", dom: "", kind: "", pk: "", n: 1, before: "system_default", expected: "system_default" },
];
