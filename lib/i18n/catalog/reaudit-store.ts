/**
 * 언어 재감사 2026-11-27 — store 도메인 새 키 (설계 `docs/audit/i18n-full-reaudit-fix-design-2026-11-27.md`).
 * ko·en 을 같은 키로 동시에 넣는다. 다른 카탈로그와 키가 겹치면 `check:i18n-quality` duplicate-key 실패.
 */
export const reauditStoreMessages = {
  ko: {
    /** 상품권 유효기간 — `format-gift-certificate-expiration.ts` */
    gift_valid_until: "{date}까지",
    /** 주문 채팅 요약 (`format-store-order-chat-summary.ts`) */
    store_order_summary_header: "📋 주문 요약",
    store_order_summary_store: "매장: {store}",
    store_order_summary_order_no: "주문번호: {orderNo}",
    store_order_summary_status: "상태: {status}",
    store_order_summary_address: "배달 주소: {address}",
    store_order_summary_phone: "연락처: {phone}",
    store_order_summary_items: "— 품목 —",
    store_order_summary_discount: "할인: -{amount}",
    store_order_summary_delivery_fee: "배달비: {amount}",
    store_order_summary_total: "합계: {amount}",
    store_order_summary_note: "요청사항: {note}",
    /** 주문 채팅 말풍선 보낸 사람 — 구매자 이름 없음 */
    store_order_chat_sender_buyer_fallback: "주문자",
    /** 다시 주문 — 담을 메뉴 없음 */
    store_reorder_err_no_items: "담을 메뉴가 없습니다.",
    /** 매장 공개 페이지 검색 설명 */
    store_seo_desc_region: "{region} · 동네 매장",
    store_seo_desc_default: "동네 매장",
    /** 옵션 그룹 이름 없음 */
    store_option_group_fallback: "옵션 {n}",
    /** 장바구니에서 상품 시트 — 영업 시간 아님 */
    store_cart_sheet_blocked_hours: "지금은 영업 시간이 아니어서 메뉴를 선택할 수 없습니다.",
    /** 주문 품목 메모 */
    store_line_note_label: "메모: {note}",
    store_line_note_with_options: "{options} · 메모: {note}",
    /** 매장 주소 입력 (`store-address-form-ui.ts`) */
    store_addr_hint_store_public: "공개 매장 페이지 상단 위치·주소에 반영됩니다.",
    store_addr_street_label: "지번·건물명·번지",
    store_addr_street_hint: "지역·동네는 위에서 고르고, 목록에 없을 때는 3자 이상 입력하세요.",
    store_addr_detail_label: "동·호·출입 등",
    store_addr_street_placeholder: "예: Barangay · 건물명 · 번지",
    /** 조리 시간 기본값 */
    store_prep_default_range: "20~40분",
    /** 메뉴 옵션 있음 표시 */
    store_menu_has_options: "옵션 있음",
    /** 사장님 상품 — 관리자 잠금 라벨 */
    store_admin_lock_action_label: "관리자 {lock} 조치",
    /** 매장 정산 — 검수 필터 탭 묶음 */
    store_commission_review_filter_aria: "검수 필터",
    /** 거래 글 사진 올리기 오류 */
    post_image_upload_err_invalid_request: "사진 파일을 다시 선택해 주세요.",
    post_image_upload_err_failed: "사진을 올리지 못했습니다. 다시 시도해 주세요.",
    /** 판매자 주문 채팅 — 주문 내역 패널 */
    store_chat_seller_panel_open: "주문 내역 패널 열기",
    store_chat_seller_panel_close: "주문 내역 패널 닫기",
    /** 배달 주문 채팅방 부제목 */
    store_chat_room_subtitle_status: "주문 상태 · {status}",
    store_chat_room_subtitle_delivery: "배달채팅",
    /** 가격 입력 통화 단위 (`lib/utils/format.ts` getCurrencyUnitLabel) — ko 는 기존 표기 그대로 */
    currency_unit_krw: "원",
    currency_unit_usd: "달러",
  },
  en: {
    gift_valid_until: "Valid until {date}",
    store_order_summary_header: "📋 Order summary",
    store_order_summary_store: "Store: {store}",
    store_order_summary_order_no: "Order no.: {orderNo}",
    store_order_summary_status: "Status: {status}",
    store_order_summary_address: "Delivery address: {address}",
    store_order_summary_phone: "Phone: {phone}",
    store_order_summary_items: "— Items —",
    store_order_summary_discount: "Discount: -{amount}",
    store_order_summary_delivery_fee: "Delivery fee: {amount}",
    store_order_summary_total: "Total: {amount}",
    store_order_summary_note: "Request: {note}",
    store_order_chat_sender_buyer_fallback: "Customer",
    store_reorder_err_no_items: "No items to add.",
    store_seo_desc_region: "{region} · Neighborhood store",
    store_seo_desc_default: "Neighborhood store",
    store_option_group_fallback: "Option {n}",
    store_cart_sheet_blocked_hours: "The store is closed now, so you can't choose items.",
    store_line_note_label: "Note: {note}",
    store_line_note_with_options: "{options} · Note: {note}",
    store_addr_hint_store_public: "Shown as the location and address on your store page.",
    store_addr_street_label: "Street, building, lot",
    store_addr_street_hint: "Pick the region and neighborhood above. If not listed, type 3+ letters.",
    store_addr_detail_label: "Unit, floor, entrance",
    store_addr_street_placeholder: "e.g. Barangay · Building · Lot",
    store_prep_default_range: "20–40 min",
    store_menu_has_options: "Has options",
    store_admin_lock_action_label: "Admin action: {lock}",
    store_commission_review_filter_aria: "Review filter",
    post_image_upload_err_invalid_request: "Please choose the photo again.",
    post_image_upload_err_failed: "Couldn't upload the photo. Please try again.",
    store_chat_seller_panel_open: "Open order panel",
    store_chat_seller_panel_close: "Close order panel",
    store_chat_room_subtitle_status: "Order status · {status}",
    store_chat_room_subtitle_delivery: "Delivery chat",
    currency_unit_krw: "KRW",
    currency_unit_usd: "USD",
  },
} as const;
