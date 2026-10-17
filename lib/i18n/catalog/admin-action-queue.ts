/**
 * Admin Action Queue (Bell · CP Action Queue · order admin decisions) i18n.
 * Separate top-level catalog: `adminMessages` is at the TS type-serialization limit (TS7056).
 */

export const adminActionQueueMessages = {
  ko: {
    admin_report_list_load_failed: "일부 신고 목록을 불러오지 못했습니다. 새로고침 후 다시 확인하세요.",
    admin_inbox_title: "관리자 알림함",
    admin_inbox_desc:
      "관리자에게 전달된 운영 알림입니다. 읽음 처리는 알림에만 적용되며 업무 처리 상태는 바뀌지 않습니다. 처리 대기 업무는 벨(액션 큐)에서 확인하세요.",
    admin_inbox_link_label: "관리자 알림함",
    admin_inbox_empty: "새 관리자 알림이 없습니다.",
    admin_inbox_mark_all_read: "모두 읽음",
    admin_inbox_load_more: "더 보기",
    admin_inbox_load_error: "알림을 불러오지 못했습니다.",
    admin_inbox_unread_only: "안 읽은 알림만",
    admin_inbox_open_work: "업무 열기",
    admin_action_queue_page_title: "관리자 처리 업무 (액션 큐)",
    admin_action_queue_page_desc:
      "관리자가 승인·반려·조치해야 할 업무 건수입니다. 알림 미읽음 수가 아니며, 상단 벨 숫자와 같습니다.",
    admin_ops_bell_meaning: "관리자 처리 대기 업무",
    admin_ops_bell_degraded: "관리자 처리 업무 일부를 불러오지 못했습니다",
    admin_cp_action_queue_meaning:
      "벨 숫자 = 관리자가 지금 처리해야 할 업무 건수입니다 (알림 미읽음 수가 아닙니다). 아래 카드 합계와 같습니다.",
    admin_cp_action_queue_incomplete: "일부 항목을 불러오지 못해 합계가 불완전합니다. 확인 불가 카드를 확인하세요.",
    admin_cp_action_queue_stale: "최근 갱신에 실패했습니다. 마지막으로 불러온 값입니다.",
    admin_queue_card_unavailable: "확인 불가",
    admin_queue_card_owner_monitoring: "사장님 처리 · 합계 제외",
    admin_store_orders_cancel_request_approve: "취소 승인",
    admin_store_orders_cancel_request_reject: "취소 반려",
    admin_store_orders_confirm_cancel_request_approve: "취소 요청을 승인할까요? 결제가 취소 처리됩니다.",
    admin_store_orders_confirm_cancel_request_reject: "취소 요청을 반려하고 이전 상태로 되돌릴까요?",
    admin_stores_orders_status_cancel_requested: "취소요청",
    admin_stores_orders_filter_admin_queue: "관리자 처리 필요 (액션 큐)",
  },
  en: {
    admin_report_list_load_failed: "Some reports could not be loaded. Refresh and check again.",
    admin_inbox_title: "Admin inbox",
    admin_inbox_desc:
      "Operational notices sent to admins. Marking read affects only the notice, never the work status. Pending work lives in the bell (Action Queue).",
    admin_inbox_link_label: "Admin inbox",
    admin_inbox_empty: "No new admin notices.",
    admin_inbox_mark_all_read: "Mark all read",
    admin_inbox_load_more: "Load more",
    admin_inbox_load_error: "Could not load notices.",
    admin_inbox_unread_only: "Unread only",
    admin_inbox_open_work: "Open task",
    admin_action_queue_page_title: "Admin workload (Action Queue)",
    admin_action_queue_page_desc:
      "Tasks an admin must approve, reject, or resolve. This is not an unread-notification count; it matches the header bell.",
    admin_ops_bell_meaning: "Admin tasks waiting",
    admin_ops_bell_degraded: "Some admin workload could not be counted",
    admin_cp_action_queue_meaning:
      "Bell number = admin tasks to handle now (not unread notifications). It equals the sum of the cards below.",
    admin_cp_action_queue_incomplete: "Some categories failed to load, so the total is incomplete. Check the unavailable cards.",
    admin_cp_action_queue_stale: "The latest refresh failed. Showing the last loaded values.",
    admin_queue_card_unavailable: "Unavailable",
    admin_queue_card_owner_monitoring: "Owner to handle · not in total",
    admin_store_orders_cancel_request_approve: "Approve cancel",
    admin_store_orders_cancel_request_reject: "Reject cancel",
    admin_store_orders_confirm_cancel_request_approve: "Approve this cancel request? The payment will be cancelled.",
    admin_store_orders_confirm_cancel_request_reject: "Reject this cancel request and restore the previous status?",
    admin_stores_orders_status_cancel_requested: "Cancel requested",
    admin_stores_orders_filter_admin_queue: "Needs admin action (Action Queue)",
  },
} as const;
