/**
 * 3-C IA-06 — 매장 쿠폰 화면 성공·오류 피드백 (오너 PATCH 전이 오류 코드 409/403/400/500 대응).
 * 별도 카탈로그: 기존 카탈로그 타입 직렬화 한도(TS7056)와 무관하게 유지.
 */
export const storeCouponOwnerFeedbackMessages = {
  ko: {
    store_coupon_owner_err_invalid_transition:
      "쿠폰 상태가 이미 바뀌어 처리할 수 없습니다. 새로고침 후 상태를 확인해 주세요.",
    store_coupon_owner_err_admin_paused:
      "관리자가 일시중지한 쿠폰은 매장에서 재개할 수 없습니다. 고객센터로 문의해 주세요.",
    store_coupon_owner_err_unsupported_max_uses: "쿠폰은 고객 1명당 1회만 사용할 수 있습니다.",
    store_coupon_owner_err_readonly: "플랫폼·공동 부담 쿠폰은 매장에서 변경할 수 없습니다.",
    store_coupon_owner_err_reissue_blocked: "관리자가 회수·반려한 쿠폰은 재발행할 수 없습니다.",
    store_coupon_owner_err_failed: "처리하지 못했습니다. 잠시 후 새로고침해 주세요.",
    store_coupon_owner_err_load: "쿠폰 목록을 불러오지 못했습니다.",
    store_coupon_owner_reload: "새로고침",
    store_coupon_owner_done_pause: "쿠폰을 일시중지했습니다.",
    store_coupon_owner_done_resume: "쿠폰을 다시 진행합니다.",
    store_coupon_owner_done_end: "쿠폰을 종료했습니다.",
    store_coupon_owner_done_reissue: "쿠폰을 재발행했습니다.",
  },
  en: {
    store_coupon_owner_err_invalid_transition:
      "The coupon status has already changed. Refresh and check the status.",
    store_coupon_owner_err_admin_paused:
      "This coupon was paused by an administrator and cannot be resumed by the store. Please contact support.",
    store_coupon_owner_err_unsupported_max_uses: "A coupon can be used only once per customer.",
    store_coupon_owner_err_readonly: "Platform or shared-funded coupons cannot be changed by the store.",
    store_coupon_owner_err_reissue_blocked: "A coupon revoked or rejected by an administrator cannot be reissued.",
    store_coupon_owner_err_failed: "Could not complete the action. Refresh in a moment.",
    store_coupon_owner_err_load: "Could not load the coupon list.",
    store_coupon_owner_reload: "Refresh",
    store_coupon_owner_done_pause: "Coupon paused.",
    store_coupon_owner_done_resume: "Coupon resumed.",
    store_coupon_owner_done_end: "Coupon ended.",
    store_coupon_owner_done_reissue: "Coupon reissued.",
  },
} as const;
