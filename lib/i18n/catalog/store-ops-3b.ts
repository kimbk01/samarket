/**
 * Stage 3-B 매장 운영 (OPS-01·03·04·05·07·09·10) i18n.
 * Separate top-level catalog — `adminMessages` / `businessMessages` 는 TS 직렬화 한도(TS7056) 근처.
 */

export const storeOps3bMessages = {
  ko: {
    business_ops3b_err_store_changed:
      "다른 화면에서 매장 정보가 먼저 저장되었습니다. 새로고침 후 변경 내용을 다시 저장해 주세요.",
    business_ops3b_err_invalid_gcash: "GCash 번호는 09로 시작하는 11자리 휴대폰 번호로 입력해 주세요.",
    business_ops3b_err_not_approved_visibility: "승인된 매장만 고객 노출을 켜거나 끌 수 있습니다.",
    business_ops3b_err_notices_unavailable:
      "매장 공지 기능을 지금 사용할 수 없습니다. 관리자에게 문의해 주세요.",
    business_ops3b_weekly_title: "요일별 영업시간",
    business_ops3b_weekly_hint:
      "요일마다 다른 시간이나 휴무 요일을 지정합니다. 「기본 시간」은 위 영업 시작·종료를 따릅니다. 자동 영업시간이 켜져 있을 때 주문 가능 여부에 반영됩니다.",
    business_ops3b_weekly_mode_default: "기본 시간",
    business_ops3b_weekly_mode_closed: "휴무",
    business_ops3b_weekly_mode_custom: "직접 지정",
    business_ops3b_weekly_open: "시작",
    business_ops3b_weekly_close: "종료",
    business_ops3b_weekly_invalid: "요일별 영업시간의 시작·종료 시각을 확인해 주세요. 시작과 종료는 같을 수 없습니다.",
    business_ops3b_closed_dates_title: "휴무일 (임시휴무)",
    business_ops3b_closed_dates_hint:
      "지정한 날짜에는 하루 종일 주문을 받지 않습니다 (매장 시간대 기준). 자동 영업시간이 켜져 있을 때 적용됩니다.",
    business_ops3b_closed_dates_add: "휴무일 추가",
    business_ops3b_closed_dates_remove: "삭제",
    business_ops3b_closed_dates_empty: "등록된 휴무일이 없습니다.",
    business_ops3b_open_toggle_manual: "주문 받기(수동)",
    business_ops3b_effective_state: "현재 상태: {state}",
    store_hours_day_mon: "월",
    store_hours_day_tue: "화",
    store_hours_day_wed: "수",
    store_hours_day_thu: "목",
    store_hours_day_fri: "금",
    store_hours_day_sat: "토",
    store_hours_day_sun: "일",
    store_hours_day_closed: "휴무",
    store_hours_upcoming_closed_dates: "휴무 예정일",
    store_commerce_state_open: "영업중",
    store_commerce_state_break: "휴게중",
    store_commerce_state_outside_hours: "영업시간 외",
    store_commerce_state_closed_day: "오늘 휴무",
    store_commerce_state_manual_closed: "수동 마감",
    notify_store_review_owner_reply_title: "사장님이 리뷰에 댓글을 남겼어요",
    notify_store_review_owner_reply_body: "사장님 답글: {reply}",
  },
  en: {
    business_ops3b_err_store_changed:
      "Store details were saved from another screen first. Refresh and save your changes again.",
    business_ops3b_err_invalid_gcash: "Enter the GCash number as an 11-digit mobile number starting with 09.",
    business_ops3b_err_not_approved_visibility: "Only approved stores can turn customer visibility on or off.",
    business_ops3b_err_notices_unavailable:
      "Store notices are unavailable right now. Please contact the administrator.",
    business_ops3b_weekly_title: "Hours by weekday",
    business_ops3b_weekly_hint:
      "Set different hours or closed weekdays. \"Default hours\" follows the open/close times above. Applied to ordering while automatic hours are on.",
    business_ops3b_weekly_mode_default: "Default hours",
    business_ops3b_weekly_mode_closed: "Closed",
    business_ops3b_weekly_mode_custom: "Custom",
    business_ops3b_weekly_open: "Open",
    business_ops3b_weekly_close: "Close",
    business_ops3b_weekly_invalid: "Check the weekday open/close times. Open and close cannot be the same.",
    business_ops3b_closed_dates_title: "Closed dates (temporary closure)",
    business_ops3b_closed_dates_hint:
      "No orders are accepted all day on these dates (store time zone). Applied while automatic hours are on.",
    business_ops3b_closed_dates_add: "Add closed date",
    business_ops3b_closed_dates_remove: "Remove",
    business_ops3b_closed_dates_empty: "No closed dates.",
    business_ops3b_open_toggle_manual: "Accept orders (manual)",
    business_ops3b_effective_state: "Current status: {state}",
    store_hours_day_mon: "Mon",
    store_hours_day_tue: "Tue",
    store_hours_day_wed: "Wed",
    store_hours_day_thu: "Thu",
    store_hours_day_fri: "Fri",
    store_hours_day_sat: "Sat",
    store_hours_day_sun: "Sun",
    store_hours_day_closed: "Closed",
    store_hours_upcoming_closed_dates: "Upcoming closed dates",
    store_commerce_state_open: "Open",
    store_commerce_state_break: "On break",
    store_commerce_state_outside_hours: "Outside business hours",
    store_commerce_state_closed_day: "Closed today",
    store_commerce_state_manual_closed: "Closed (manual)",
    notify_store_review_owner_reply_title: "The owner replied to your review",
    notify_store_review_owner_reply_body: "Owner reply: {reply}",
  },
} as const;
