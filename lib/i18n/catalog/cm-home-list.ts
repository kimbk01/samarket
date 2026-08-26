/** Phase 12b: CM inbox list previews, badges, call rows (`use-community-messenger-home-state`) */

export const cmHomeListMessages = {

  ko: {

    cm_home_call_video: "영상 통화",

    cm_home_call_voice: "음성 통화",

    cm_home_call_missed: "부재중 통화",

    cm_home_call_cancelled: "{kind} · 취소됨",

    cm_home_call_rejected: "{kind} · 거절됨",

    cm_home_call_with_duration: "{kind} · {duration}",

    cm_home_call_ended: "{kind} 종료",

    cm_home_call_duration_secs: "{secs}초",

    cm_home_call_duration_mins: "{mins}분 {secs}초",

    cm_home_badge_open: "오픈",

    cm_home_badge_group: "그룹",

    cm_home_badge_delivery: "배달",

    cm_home_badge_trade: "거래",

    cm_home_badge_direct: "1:1",

    cm_home_preview_photo: "사진",

    cm_home_preview_voice: "음성 메시지",

    cm_home_preview_file: "파일",

    cm_home_preview_file_named: "파일 · {name}",

    cm_home_preview_call: "통화",

    cm_home_preview_call_named: "통화 · {detail}",

    cm_home_preview_check_message: "메시지를 확인해 주세요.",

    cm_home_preview_trade_order_guide: "거래·주문 안내",

    cm_home_preview_no_messages: "최근 메시지가 아직 없습니다.",

    cm_home_sys_message: "시스템 메시지",

    cm_home_sys_notice_changed: "공지 변경",

    cm_home_sys_notice_deleted: "공지 삭제",

    cm_home_sys_permission_changed: "권한 변경",

    cm_home_sys_order_accepted: "주문 접수됨",

    cm_home_sys_trade_offer: "거래 제안",

    cm_home_sys_trade_offer_amount: "거래 제안 {amount}",

    cm_svc_store_fallback: "매장",
    cm_svc_order_headline: "{store} · 주문 {orderNo}",
    cm_svc_order_headline_short: "{store} · 주문",
    cm_svc_trade_flow_msg_blocked:
      "거래 진행 단계가 바뀌어 일반 메시지를 보낼 수 없습니다. 상단 안내를 확인해 주세요.",
    cm_svc_trade_seller_closed: "판매자가 대화를 종료했습니다. 새 메시지를 보낼 수 없습니다.",
    cm_svc_trade_sender_left: "이미 나간 채팅방입니다.",
    cm_svc_trade_chat_mode_locked: "이 채팅에서는 메시지를 보낼 수 없습니다.",
    cm_svc_mgmt_member_invite: "멤버 초대",
    cm_svc_mgmt_member_invite_named: "멤버 초대 · {labels}",
    cm_svc_mgmt_notice_edit: "공지 수정 · {text}",
    cm_svc_mgmt_notice_delete: "공지 삭제",
    cm_svc_mgmt_permissions: "운영 권한 변경",
    cm_svc_mgmt_admin_assign: "관리자 지정",
    cm_svc_mgmt_admin_assign_named: "관리자 지정 · {name}",
    cm_svc_mgmt_admin_revoke: "관리자 해제",
    cm_svc_mgmt_admin_revoke_named: "관리자 해제 · {name}",
    cm_svc_mgmt_owner_transfer: "방장 위임",
    cm_svc_mgmt_owner_transfer_named: "방장 위임 · {name}",
    cm_svc_mgmt_member_kick: "멤버보내기",
    cm_svc_mgmt_member_kick_named: "멤버보내기 · {name}",
    cm_svc_mgmt_change_fallback: "운영 변경",
    cm_svc_mgmt_notice_changed_title: "공지 변경",
    cm_svc_mgmt_notice_deleted_title: "공지 삭제",
    cm_svc_mgmt_notice_deleted_detail: "등록된 공지를 비웠습니다.",
    cm_svc_mgmt_permissions_title: "권한 변경",
    cm_svc_mgmt_permissions_detail: "그룹 운영 권한을 조정했습니다.",
    cm_svc_user_default: "사용자",
    cm_svc_deleted_message: "삭제된 메시지",
    cm_svc_message_default: "메시지",
    cm_svc_sticker_preview: "스티커",
    cm_svc_gift_certificate_preview: "상품권",
    cm_svc_photos_album_preview: "사진 {count}장",
    cm_svc_notification_preview: "알림",
    cm_svc_room_desc_direct: "친구와 1:1로 대화하는 메신저 방",
    cm_svc_room_desc_group: "{count}명이 함께 있는 {visibility} 그룹 채팅",
    cm_svc_room_vis_open: "공개",
    cm_svc_room_vis_private: "비공개",

  },

  en: {

    cm_home_call_video: "Video call",

    cm_home_call_voice: "Voice call",

    cm_home_call_missed: "Missed call",

    cm_home_call_cancelled: "{kind} · Cancelled",

    cm_home_call_rejected: "{kind} · Declined",

    cm_home_call_with_duration: "{kind} · {duration}",

    cm_home_call_ended: "{kind} ended",

    cm_home_call_duration_secs: "{secs}s",

    cm_home_call_duration_mins: "{mins}m {secs}s",

    cm_home_badge_open: "Open",

    cm_home_badge_group: "Group",

    cm_home_badge_delivery: "Delivery",

    cm_home_badge_trade: "Trade",

    cm_home_badge_direct: "Direct",

    cm_home_preview_photo: "Photo",

    cm_home_preview_voice: "Voice message",

    cm_home_preview_file: "File",

    cm_home_preview_file_named: "File · {name}",

    cm_home_preview_call: "Call",

    cm_home_preview_call_named: "Call · {detail}",

    cm_home_preview_check_message: "Check your messages.",

    cm_home_preview_trade_order_guide: "Trade & order update",

    cm_home_preview_no_messages: "No messages yet.",

    cm_home_sys_message: "System message",

    cm_home_sys_notice_changed: "Notice updated",

    cm_home_sys_notice_deleted: "Notice removed",

    cm_home_sys_permission_changed: "Permissions updated",

    cm_home_sys_order_accepted: "Order accepted",

    cm_home_sys_trade_offer: "Trade offer",

    cm_home_sys_trade_offer_amount: "Trade offer {amount}",

    cm_svc_store_fallback: "Store",
    cm_svc_order_headline: "{store} · Order {orderNo}",
    cm_svc_order_headline_short: "{store} · Order",
    cm_svc_trade_flow_msg_blocked:
      "The trade stage changed — you cannot send a normal message. Check the banner above.",
    cm_svc_trade_seller_closed: "The seller ended this chat. You cannot send new messages.",
    cm_svc_trade_sender_left: "You have already left this chat.",
    cm_svc_trade_chat_mode_locked: "You cannot send messages in this chat.",
    cm_svc_mgmt_member_invite: "Member invited",
    cm_svc_mgmt_member_invite_named: "Member invited · {labels}",
    cm_svc_mgmt_notice_edit: "Notice updated · {text}",
    cm_svc_mgmt_notice_delete: "Notice removed",
    cm_svc_mgmt_permissions: "Permissions updated",
    cm_svc_mgmt_admin_assign: "Admin assigned",
    cm_svc_mgmt_admin_assign_named: "Admin assigned · {name}",
    cm_svc_mgmt_admin_revoke: "Admin removed",
    cm_svc_mgmt_admin_revoke_named: "Admin removed · {name}",
    cm_svc_mgmt_owner_transfer: "Owner transferred",
    cm_svc_mgmt_owner_transfer_named: "Owner transferred · {name}",
    cm_svc_mgmt_member_kick: "Member removed",
    cm_svc_mgmt_member_kick_named: "Member removed · {name}",
    cm_svc_mgmt_change_fallback: "Group update",
    cm_svc_mgmt_notice_changed_title: "Notice updated",
    cm_svc_mgmt_notice_deleted_title: "Notice removed",
    cm_svc_mgmt_notice_deleted_detail: "The notice was cleared.",
    cm_svc_mgmt_permissions_title: "Permissions updated",
    cm_svc_mgmt_permissions_detail: "Group permissions were updated.",
    cm_svc_user_default: "User",
    cm_svc_deleted_message: "Deleted message",
    cm_svc_message_default: "Message",
    cm_svc_sticker_preview: "Sticker",
    cm_svc_gift_certificate_preview: "Gift certificate",
    cm_svc_photos_album_preview: "{count} photos",
    cm_svc_notification_preview: "Notification",
    cm_svc_room_desc_direct: "Direct chat with a friend",
    cm_svc_room_desc_group: "{visibility} group chat with {count} members",
    cm_svc_room_vis_open: "Open",
    cm_svc_room_vis_private: "Private",

  },

};


