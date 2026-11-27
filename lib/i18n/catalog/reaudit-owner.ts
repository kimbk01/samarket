/**
 * 언어 재감사 2026-11-27 — owner 도메인 새 키 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`).
 * ko·en 을 같은 키로 동시에 넣는다. 다른 카탈로그와 키가 겹치면 `check:i18n-quality` duplicate-key 실패.
 */
export const reauditOwnerMessages = {
  ko: {
    /** 판매자 본인 글 API 오류 코드 (`lib/posts/owner-post-api-error-text.ts`) */
    owner_post_err_not_owner: "본인 글만 바꿀 수 있습니다.",
    owner_post_err_delete_not_allowed: "지금은 이 글을 삭제할 수 없습니다.",
    owner_post_err_location_invalid: "거래 지역을 다시 골라 주세요.",
    owner_post_err_price_invalid: "가격을 다시 확인해 주세요.",
    owner_post_err_sold_is_final: "판매완료한 글은 판매중으로 되돌릴 수 없습니다.",
    owner_post_err_sold_requires_seller_complete: "거래완료는 채팅에서 판매완료로 처리해 주세요.",
    owner_post_err_owner_deleted: "삭제한 글은 다시 보이게 할 수 없습니다.",
    owner_post_err_phone_verification_required: "전화번호 인증 후 이용할 수 있습니다.",
    /** 사장님 주문 처리 — 모르는 오류 코드 */
    owner_order_err_action_failed: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    /** 사장님 팝업 광고 신청 — 자른 그림 미리보기 대체 글 */
    owner_platform_popup_crop_preview_alt: "자른 그림 미리보기 (36:25)",
    /** 사장님 상품 수정 — 주소에 매장이 없을 때 */
    owner_product_edit_need_store: "매장을 고른 뒤 상품을 선택해 주세요.",
    /** 사장님 상품 저장·사진 올리기 오류 코드 (`lib/business/owner-api-error-text.ts`) */
    owner_product_err_discount_not_lower: "할인가는 판매가보다 낮아야 합니다.",
    owner_product_err_changed_elsewhere: "다른 곳에서 상품이 바뀌었습니다. 새로 불러온 뒤 다시 저장해 주세요.",
    owner_product_err_detail_same_as_main: "상세 사진에 대표 사진과 같은 사진을 넣을 수 없습니다.",
    owner_product_err_image_too_big_px: "사진 가로·세로는 각 8192px 이하여야 합니다.",
    owner_product_err_image_size_unknown: "사진 크기를 확인할 수 없습니다. 다른 사진으로 해 주세요.",
    owner_product_err_upload_unavailable: "지금은 사진을 올릴 수 없습니다. 잠시 후 다시 시도해 주세요.",
    owner_product_err_image_type: "사진은 JPG, PNG, WebP만 올릴 수 있습니다.",
    owner_product_err_image_required: "사진을 골라 주세요.",
    /** 사장님 상품 등록·수정 검사 코드 (사후 검토 E2 2026-11-27) */
    owner_product_err_invalid_stock: "재고를 올바르게 입력해 주세요.",
    owner_product_err_invalid_discount_percent: "할인율은 0~100 사이로 입력해 주세요.",
    owner_product_err_discount_for_price: "이 가격에는 그 할인율을 쓸 수 없습니다. 할인율을 바꿔 주세요.",
    owner_product_err_price_required_for_discount: "할인율을 넣으려면 가격을 먼저 입력해 주세요.",
    owner_product_err_invalid_item_type: "상품 종류가 올바르지 않습니다. 다시 골라 주세요.",
    /** 매장 영업시간 자동 요약 (`localizeStoredWeekdaysSummary`) */
    owner_store_hours_daily_range: "매일 {range}",
    /** 라이더 API 오류 코드 (`lib/rider/rider-api-error-text.ts`) */
    rider_err_not_assigned: "내게 배정된 배달이 아닙니다.",
    rider_err_step_not_allowed: "지금 단계에서는 할 수 없습니다.",
    rider_err_stale_retry: "상태가 바뀌었습니다. 새로고침 후 다시 시도해 주세요.",
    rider_err_failure_already_reported: "이미 실패 보고를 보냈습니다.",
    rider_err_failure_reason_required: "실패 사유를 입력해 주세요.",
    rider_err_not_active: "지금은 배달을 받을 수 없는 상태입니다.",
  },
  en: {
    owner_post_err_not_owner: "Only the seller can change this listing.",
    owner_post_err_delete_not_allowed: "This listing can't be deleted right now.",
    owner_post_err_location_invalid: "Choose the trade area again.",
    owner_post_err_price_invalid: "Check the price again.",
    owner_post_err_sold_is_final: "A sold listing can't go back to on sale.",
    owner_post_err_sold_requires_seller_complete: "Mark the deal as sold from the chat.",
    owner_post_err_owner_deleted: "A deleted listing can't be shown again.",
    owner_post_err_phone_verification_required: "Verify your phone number to continue.",
    owner_order_err_action_failed: "Couldn't complete this. Try again shortly.",
    owner_platform_popup_crop_preview_alt: "Cropped picture preview (36:25)",
    owner_product_edit_need_store: "Choose a store, then pick a product.",
    owner_product_err_discount_not_lower: "The sale price must be lower than the price.",
    owner_product_err_changed_elsewhere: "This item changed elsewhere. Reload it and save again.",
    owner_product_err_detail_same_as_main: "Detail photos can't repeat the main photo.",
    owner_product_err_image_too_big_px: "Photo width and height must each be 8192px or less.",
    owner_product_err_image_size_unknown: "Couldn't read the photo size. Try another photo.",
    owner_product_err_upload_unavailable: "Photos can't be uploaded right now. Try again later.",
    owner_product_err_image_type: "Only JPG, PNG, or WebP photos can be used.",
    owner_product_err_image_required: "Choose a photo.",
    owner_product_err_invalid_stock: "Enter a valid stock amount.",
    owner_product_err_invalid_discount_percent: "Enter a discount from 0 to 100%.",
    owner_product_err_discount_for_price: "This discount doesn't work with this price. Change the discount.",
    owner_product_err_price_required_for_discount: "Enter a price before adding a discount.",
    owner_product_err_invalid_item_type: "The item type isn't valid. Choose it again.",
    owner_store_hours_daily_range: "Daily {range}",
    rider_err_not_assigned: "This delivery isn't assigned to you.",
    rider_err_step_not_allowed: "You can't do this at this step.",
    rider_err_stale_retry: "The status changed. Refresh and try again.",
    rider_err_failure_already_reported: "You already sent a failure report.",
    rider_err_failure_reason_required: "Enter a reason for the failure.",
    rider_err_not_active: "You can't take deliveries right now.",
  },
} as const;
