/**
 * 배달 Admin 운영 UX 정리 (R2) — 신규 문구 + 운영자 용어 교정.
 * admin.ts 의 ko/en 블록 맨 끝에서 spread 되므로 같은 키는 이 파일 값이 우선한다.
 */
export const adminDeliveryOpsUxMessages = {
  ko: {
    // 배달 페이지 제목 = 메뉴명
    admin_page_store_review_queue: "입점 심사",
    admin_biz_page_list: "매장 운영",
    admin_biz_page_cc: "매장 상세",
    admin_ops_console_page_title: "운영 콘솔",
    admin_order_chats_hub_title: "주문 채팅",
    admin_page_store_products: "메뉴·상품 검수",
    admin_stores_home_shelves_title: "홈 화면 구성",
    admin_del_alert_page_title: "배달 경고",
    admin_stores_fee_err_no_default_left:
      "지금 적용 중인 다른 플랫폼 기본 수수료 정책이 없어 종료할 수 없습니다. 새 기본 정책을 먼저 등록하세요.",
    admin_stores_fee_err_policy_archived: "보관된 정책은 변경할 수 없습니다.",
    admin_stores_fee_deactivate_confirm_title: "수수료 정책을 종료할까요?",
    admin_stores_fee_deactivate_confirm_desc:
      "종료하면 이후 주문부터 상위 정책(업종 → 플랫폼 기본)이 적용됩니다. 변경 사유를 입력하세요. 작업 기록에 남습니다.",
    admin_stores_fee_deactivate_confirm_cta: "정책 종료",
    admin_stores_fee_change_reason_placeholder: "변경 사유 (2자 이상)",
    // LOC-011 — 저장된 거리정책 원값이 코드 적용값과 다를 때
    admin_delivery_distance_raw_normalized_note:
      "저장된 거리 정책 원값 중 일부({fields})는 현재 적용 값과 달라 화면에는 실제 적용 값으로 표시합니다. 다음 저장 시 적용 값으로 정규화되어 기록됩니다.",
    admin_delivery_distance_raw_ignored_note:
      "저장된 값 중 {fields} 는 현재 판정에 쓰이지 않습니다(매장별 배달 반경이 기준).",
  },
  en: {
    admin_page_store_review_queue: "Store onboarding review",
    admin_biz_page_list: "Store operations",
    admin_biz_page_cc: "Store detail",
    admin_ops_console_page_title: "Ops console",
    admin_order_chats_hub_title: "Order chats",
    admin_page_store_products: "Menu & product review",
    admin_stores_home_shelves_title: "Home screen layout",
    admin_del_alert_page_title: "Delivery alerts",
    admin_stores_fee_err_no_default_left:
      "No other platform default fee policy is active now, so this one cannot be ended. Add a new default policy first.",
    admin_stores_fee_err_policy_archived: "Archived policies cannot be changed.",
    admin_stores_fee_deactivate_confirm_title: "End this fee policy?",
    admin_stores_fee_deactivate_confirm_desc:
      "Orders after this will use the parent policy (category → platform default). Enter a reason; it is recorded in the activity log.",
    admin_stores_fee_deactivate_confirm_cta: "End policy",
    admin_stores_fee_change_reason_placeholder: "Reason for change (2+ characters)",
    admin_delivery_distance_raw_normalized_note:
      "Some stored distance-policy values ({fields}) differ from what is applied, so this screen shows the applied values. They are normalized to the applied values on the next save.",
    admin_delivery_distance_raw_ignored_note:
      "Stored {fields} is not used for eligibility (each store's delivery radius is the authority).",
  },
} as const;
