/**
 * 채팅 Admin R1 — 메뉴·페이지·신고 큐 문구.
 */
export const adminChatR1CMessages = {
  ko: {
    // J-AMD-4 메뉴 (O-C12)
    admin_menu_chat_section_rooms: "채팅방",
    admin_menu_chat_section_reports: "신고·제재",
    admin_menu_chat_section_calls: "통화 기록",
    admin_menu_chat_section_system: "시스템",
    admin_menu_chat_rooms_general: "일반 1:1",
    admin_menu_chat_rooms_group: "그룹",
    admin_menu_chat_rooms_trade: "거래",
    admin_menu_chat_rooms_store_order: "배달 주문",
    admin_menu_chat_report_queue: "채팅 신고",
    admin_menu_chat_call_records: "통화·강제 종료 기록",
    // C-12 메신저 성능 — 인스턴스 표본 표기
    admin_chat_perf_instance_notice_title: "이 값은 서버 인스턴스 1개의 메모리 표본입니다",
    admin_chat_perf_instance_notice_body:
      "응답한 서버 인스턴스의 프로세스 메모리에 쌓인 최근 표본만 보여 줍니다. 플랫폼 전체 합계가 아니고, 인스턴스가 바뀌거나 재시작되면 값이 달라지거나 비어 있습니다. SLO 달성·위반 판정 근거로 쓰지 마세요.",
    admin_chat_perf_sample_summary_title: "표본 요약 (이 인스턴스 메모리 — 목표 대비 참고용)",
    admin_chat_perf_reference_targets_title: "참조 목표값 (p95·비율 — 문서 기준, 측정값 아님)",
    admin_chat_app_room_th: "앱 채팅방",
  },
  en: {
    admin_menu_chat_section_rooms: "Chat rooms",
    admin_menu_chat_section_reports: "Reports & sanctions",
    admin_menu_chat_section_calls: "Call records",
    admin_menu_chat_section_system: "System",
    admin_menu_chat_rooms_general: "1:1 chats",
    admin_menu_chat_rooms_group: "Groups",
    admin_menu_chat_rooms_trade: "Trade",
    admin_menu_chat_rooms_store_order: "Delivery orders",
    admin_menu_chat_report_queue: "Chat reports",
    admin_menu_chat_call_records: "Calls & force-ends",
    admin_chat_perf_instance_notice_title: "These values are a single server instance's memory sample",
    admin_chat_perf_instance_notice_body:
      "Only recent samples held in the responding instance's process memory are shown. They are not platform totals, and they change or reset when the instance changes or restarts. Do not use them to judge SLO compliance.",
    admin_chat_perf_sample_summary_title: "Sample summary (this instance's memory — reference vs target)",
    admin_chat_perf_reference_targets_title: "Reference targets (p95 · ratios — from docs, not measurements)",
    admin_chat_app_room_th: "App room",
  },
} as const;
