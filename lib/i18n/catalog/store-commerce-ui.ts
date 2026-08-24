/** 매장·주문·배달 구매자 UI (phase 6) — owner/admin 제외 */

export const storeCommerceUiMessages = {

  ko: {

    store_sub_industry_aria: "하위 업종",

    store_invalid_industry: "존재하지 않는 업종입니다.",

    store_verifying_live_link: "실매장 연동 확인 중…",

    store_empty_store_list: "표시할 매장이 없습니다.",

    store_browse_other_industries: "다른 업종 둘러보기",

    store_industry_grid_title: "업종별 둘러보기",

    store_checkout_confirm_title: "주문 내용을 확인해 주세요",

    store_checkout_confirm_order_summary: "주문 상품",

    store_label_contact: "연락처",

    store_label_address: "주소",

    store_label_payment: "결제",

    store_checkout_submitting: "접수 중…",

    store_checkout_submit: "주문 접수",

    store_order_thanks: "감사합니다",

    store_order_number: "주문번호",

    store_order_vendor: "업체",

    store_order_amount: "주문 금액",

    store_order_load_failed: "주문 정보를 불러오지 못했거나 주문 번호가 없습니다.",

    store_back_to_store_aria: "매장으로",

    store_order_not_found: "주문을 찾을 수 없거나 올바른 주문 번호가 아닙니다.",
    store_order_status_line: "상태: {status} · {fulfillment}",

    store_menu_search_placeholder: "메뉴명을 검색해보세요",

    store_popular_menu_aria: "인기 메뉴",

    store_sold_out: "품절",

    store_favorite_login_required: "로그인 후 찜할 수 있습니다.",

    store_primary_industry_aria: "대분류 업종",

    store_browse_primary_menu_all: "메뉴 전체보기",

    store_subtopic_suffix: " · 세부 주제",

    store_collect_view: "모아보기",

    store_browse_view_all: "전체 보기",

    store_browse_food_all: "전체",

    store_feed_stores_title: "매장",

    store_more_food_link: "음식 더보기",

    store_by_industry_link: "업종별",

    store_register_store: "매장 등록",

    store_add_store: "매장 추가",

    store_region_settings_btn: "동네 설정",

    store_browse_by_industry_find: "업종별 찾기",

    store_browse_primary_fallback: "매장",

    store_supabase_unconfigured_hint:
      "Supabase가 연결되지 않았거나 매장 테이블이 아직 없습니다.",

    store_browse_primary_restaurant: "식당",

    store_browse_primary_mart: "마트",

    store_browse_primary_hardware: "공구류",

    store_browse_primary_pet: "펫샵",

    store_browse_primary_cafe: "카페",

    store_browse_primary_beauty: "미용",

    store_browse_primary_academy: "학원",

    store_browse_primary_life: "서비스",

    store_browse_primary_lifestyle: "라이프",

    store_browse_primary_restaurant_desc: "식당·음식 배달",

    store_browse_primary_mart_desc: "마트·생필품",

    store_browse_primary_lifestyle_desc: "생활·서비스",

    store_browse_food_korean: "한식",

    store_browse_food_chicken: "치킨·고기",

    store_browse_food_noodles: "면·국물",

    store_browse_food_chinese: "중식",

    store_browse_food_japanese: "일식",

    store_browse_food_pizza: "피자·양식",

    store_browse_food_snack: "분식",

    store_browse_food_lunchbox: "도시락",

    store_browse_food_local: "현지식",

    store_browse_food_dessert: "카페·디저트",

    store_browse_food_late_night: "야식",

    store_browse_food_western: "양식",

    store_stores_home: "매장 홈",

    store_browse_loading_list: "실매장 목록을 불러오는 중…",

    store_browse_list_preparing:
      "지금은 이 업종의 매장 목록을 준비 중입니다. 잠시 후 다시 확인해 주세요.",

    store_browse_list_live: "등록된 실매장입니다. 동네·위치 설정에 따라 정렬됩니다.",

    store_browse_list_empty:
      "이 업종·세부 주제에 노출된 매장이 없습니다. 업종·승인·노출을 확인해 주세요.",

    store_browse_list_fetch_failed: "목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",

    store_browse_home_link: "매장 홈으로",

    store_browse_empty_preparing:
      "매장 목록을 준비 중입니다. 잠시 후 다시 확인하거나 다른 업종을 먼저 둘러보세요.",

    store_browse_empty_hint:
      "다른 세부 업종을 선택하거나, 매장의 업종·세부 주제·승인·노출 상태를 확인해 주세요.",

    store_browse_scope_disabled_hint: "이 업종(1·2차)은 현재 운영에서 비활성입니다.",

    store_browse_industry_map_link: "매장 홈 업종 지도로",

    store_order_dash_chip_receiving: "접수",

    store_order_dash_chip_preparing: "준비",

    store_order_dash_chip_delivering: "배달",

    store_order_dash_loading_hint: "주문 요약을 불러오는 중이에요. 바로가기부터 먼저 사용할 수 있어요.",

    store_order_dash_guest_hint: "로그인 후 주문·채팅을 가로로 빠르게 열 수 있어요.",

    store_order_dash_login: "로그인",

    store_order_dash_hub: "주문 허브",

    store_order_dash_all_count: "전체 {count}",

    store_order_dash_open: "열기",

    store_row_menu_view_aria: "{store} · {item} 메뉴 보기",

    store_row_store_more_aria: "{store} 매장 더보기",

    store_featured_menu_image_aria: "대표 메뉴 이미지",

    store_show_more: "더보기",

    store_straight_distance_title: "직선 거리",
    store_delivery_distance_out_of_range: "거리 초과",
    store_delivery_distance_out_of_range_with_max: "{km}km 초과",

    store_hub_my_zone_title: "내 주문 · 매장 운영",
    store_hub_ops_center: "운영 센터",
    store_hub_ops_basic_info: "기본 정보",
    store_hub_ops_review_status: "심사·운영 상태",
    store_hub_ops_review_exposure: "노출 심사:",
    store_hub_ops_approved_hidden: "승인됐으나 비노출",
    store_hub_ops_check_in_center: "운영 센터에서 확인",
    store_hub_ops_all_menu: "전체 메뉴",
    store_hub_ops_my_store: "내 매장 보기",
    store_lite_inquiry_check: "문의 확인",
    store_lite_order_manage: "주문 관리",
    store_lite_delivery_chat: "배달 채팅",
    store_lite_store_settings: "매장 설정",
    store_lite_received_inquiries: "받은 문의",

    store_search_placeholder: "매장 검색",

    store_my_store_status_loading: "내 매장 상태 확인 중…",

    store_my_store_label: "내 매장",

    store_listed_on_stores: "/stores 노출",

    store_other_owned_stores: "다른 소유 매장 {count}건 — 운영 센터에서 전환할 수 있어요.",

    store_feed_eyebrow: "피드",
    store_curation_eyebrow: "큐레이션",

    store_no_registered_stores: "등록된 매장이 없습니다",

    store_spot_recommended_title: "추천 스폿",

    store_spot_recommended_subtitle: "에디터가 고른 동네 매장 — 카드를 옆으로 넘겨 보세요.",

    store_recommended_stores_aria: "추천 매장",

    store_live_eyebrow: "실시간",

    store_order_now_title: "지금 주문 가능",

    store_home_popular_stores_title: "많이 주문하는 맛집",

    store_home_new_stores_title: "새로 오픈한 맛집",

    store_home_campaigns_title: "진행 중인 이벤트",

    store_order_now_subtitle: "영업 중 · 배달 또는 포장이 열려 있어요",

    store_neighborhood_more_title: "이 동네 더보기",

    store_neighborhood_more_subtitle: "거리와 인기를 섞어 보여 드려요",

    store_my_orders_title: "내 주문",

    store_order_shortcuts_aria: "주문 바로가기",

    store_in_progress: "진행 중",

    store_history: "내역",

    store_order_chat: "주문 채팅",

    store_recent: "최근",

    store_detail_link: "상세",

    store_no_orders: "주문 없음",

    store_find_industry: "업종 찾기",

    store_status_label: "상태",

    store_order_status_filter_aria: "주문 상태 필터",

    store_ops_title: "매장 운영",

    store_owner_shortcut_title: "매장주 바로가기",

    store_ops_menu_aria: "매장 운영 메뉴",

    store_promo_eyebrow: "한눈에",

    store_promo_title: "업종 골라 바로 들어가기",

    store_promo_subtitle: "식당·마트·생활까지 탭만 바꾸면 세부가 바뀌어요.",

    store_open_industries: "업종 열기",

    store_reviews_count: "리뷰 {count}",

    store_est_prep: "예상 {label}",

    store_delivery_fee_per_store: "배달비 매장별",

    store_modifier_required: "필수",

    store_modifier_optional: "선택 {hint}",
    store_approval_status_approved: "승인됨",
    store_approval_status_pending: "신청대기",
    store_approval_status_rejected: "반려",
    store_approval_status_revision_requested: "보완요청",
    store_approval_status_suspended: "정지",
    store_approval_status_under_review: "검토중",
    store_approval_status_unknown: "상태 미정",
    store_avg_rating_label: "평균 ★ {rating}",
    store_badge_coupon: "쿠폰",
    store_insertion_sponsored: "광고",
    store_insertion_home_ads_title: "스폰서 매장",
    store_insertion_home_coupons_title: "할인 쿠폰",
    store_insertion_coupon_discount: "{discount} 할인",
    store_insertion_coupon_min_order: "최소 주문 {amount}",
    store_checkout_coupon_applied: "쿠폰 할인 적용",
    store_err_coupon_not_found: "쿠폰을 찾을 수 없습니다.",
    store_err_coupon_inactive: "사용할 수 없는 쿠폰입니다.",
    store_err_coupon_expired: "만료된 쿠폰입니다.",
    store_err_coupon_wrong_store: "이 매장에서 사용할 수 없는 쿠폰입니다.",
    store_err_coupon_min_order: "최소 주문 금액을 충족하지 못했습니다.",
    store_err_coupon_already_redeemed: "이미 사용한 쿠폰입니다.",
    store_err_coupon_invalid: "쿠폰 할인을 적용할 수 없습니다.",
    store_banner_slide_aria: "배너 {index}",
    store_cart_added_short_toast: "장바구니에 담았어요",
    store_cart_aria: "장바구니",
    store_cart_aria_with_kinds: "장바구니 · {count}종",
    store_cart_entry_sub_api: "일시적으로 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
    store_cart_entry_sub_gone: "이 주소의 장바구니를 찾을 수 없습니다.",
    store_cart_entry_sub_network: "네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
    store_cart_entry_title_network: "장바구니를 불러오지 못했습니다",
    store_cart_entry_title_not_found: "장바구니를 찾을 수 없습니다",
    store_cart_option_updated_toast: "옵션을 수정했어요",
    store_chat_inquiry_menu: "채팅 문의",
    store_checkout_phone_profile_hint_account_link: "내정보 · 계정",
    store_checkout_phone_profile_hint_prefix: "연락처는",
    store_checkout_phone_profile_hint_suffix: "에서 미리 저장할 수 있어요.",
    store_commerce_summary_disclaimer: "표시 금액·시간은 매장 설정 기준이며 실제와 다를 수 있습니다.",
    store_confirm_at_order: "주문 시 확인",
    store_content_empty: "내용 없음",
    store_copy_address_btn: "주소 복사",
    store_delivery_eta_detail: "배달 예상 시간은 매장·거리·주문량에 따라 달라질 수 있습니다.",
    store_delivery_eta_label: "배달 예상",
    store_delivery_hours_label: "배달 시간",
    store_detail_info_address_hint_after: "에서 주소·연락처·지도를 확인할 수 있어요.",
    store_detail_info_address_hint_before: "자세한 위치는",
    store_detail_info_tab_short: "가게정보",
    store_err_delivery_region_city_google_hint: "Google 검색으로 저장한 배달 주소를 선택해 주세요.",
    store_err_delivery_region_unverified: "배달 지역을 확인할 수 없습니다. 주소를 다시 선택해 주세요.",
    store_err_order_redirect_failed: "주문 페이지로 이동하지 못했습니다.",
    store_err_own_store_block: "본인 매장 상품은 주문할 수 없습니다.",
    store_err_sold_out_cannot_add: "품절된 메뉴는 담을 수 없습니다.",
    store_free_delivery_threshold_line: "{amount} 이상 무료배달",
    store_fulfillment_delivery_short: "배달",
    store_fulfillment_pickup_short: "포장",
    store_location_map_title: "{store} 위치",
    store_location_region_barangay: "지역 · 동네",
    store_location_section_default: "위치",
    store_meta_cart_title: "장바구니",
    store_meta_checkout_title: "주문서",
    store_meta_product_desc: "{store}의 상품입니다.",
    store_meta_product_title: "상품",
    store_meta_report_desc: "매장 또는 상품에 대한 신고를 접수합니다.",
    store_meta_report_title: "매장·상품 신고",
    store_meta_reviews_title: "리뷰",
    store_meta_store_info_title: "가게정보",
    store_messenger_order_chat_label: "주문 채팅",
    store_min_order_none: "최소주문 없음",
    store_modifier_count_max: "최대 {max}개",
    store_modifier_count_max_select: "최대 {max}개 선택",
    store_modifier_count_min: "{min}개 선택",
    store_modifier_count_min_select: "{min}개 이상 선택",
    store_modifier_count_range: "{min}~{max}개",
    store_modifier_count_range_select: "{min}~{max}개 선택",
    store_modifier_count_upto: "최대 {max}개",
    store_modifier_optional_chip: "선택",
    store_my_delivery_orders: "내 배달·픽업 주문",
    store_notice_check_fallback: "매장 공지를 확인해 주세요",
    store_notice_store_suffix: "{store} 공지",
    store_options_load_failed: "옵션을 불러오지 못했습니다",
    store_options_loading: "옵션 불러오는 중…",
    store_order_check_my_delivery_hint: "내 주문함에서 진행 중인 주문을 확인해 보세요.",
    store_order_completed: "주문이 완료되었습니다",
    store_payment_check_at_store: "매장에서 확인",
    store_payment_contact_store: "매장에 문의",
    store_phone_menu_call: "전화하기",
    store_phone_menu_none: "전화번호 없음",
    store_pickup_no_short: "픽업 불가",
    store_pickup_yes_short: "픽업 가능",
    store_prep_row_prefix: "예상조리 ",
    store_product_load_failed_short: "상품을 불러오지 못했습니다",
    store_product_sheet_title: "메뉴 상세",
    store_public_address_detail_label: "상세 주소",
    store_public_address_street_label: "도로명·지번",
    store_report_err_duplicate: "최근에 같은 내용으로 신고하셨습니다.",
    store_report_err_empty: "상세 내용을 입력해 주세요.",
    store_report_err_failed: "신고 접수에 실패했습니다.",
    store_report_reason_fraud: "사기·허위",
    store_report_reason_harassment: "괴롭힘·욕설",
    store_report_reason_illegal: "불법·위험",
    store_report_reason_misleading: "허위·과장 정보",
    store_report_reason_other: "기타",
    store_report_reason_spam: "스팸·광고",
    store_report_submit_btn: "신고하기",
    store_report_submitting: "접수 중…",
    store_report_target_product: "이 상품에 대한 신고입니다.",
    store_report_target_store: "이 매장에 대한 신고입니다.",
    store_store_guide_collapsed_hint: "· 영업·배달·결제 안내",
    store_store_guide_heading: "매장 안내",
    store_store_info_menu: "가게정보",
    store_stores_page_meta_description: "동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.",
    store_wrong_store_product: "이 매장의 메뉴가 아닙니다",

    store_sold_out_cannot_select: "품절 · 선택 불가",

    store_sheet_close_aria: "시트 닫기",

    store_review_summary_load_failed: "리뷰 요약을 불러오지 못했어요.",

    store_reviews_title: "리뷰",

    store_qty_decrease_aria: "수량 감소",

    store_qty_increase_aria: "수량 증가",

    store_cart_preview_empty: "담긴 메뉴가 없어요",

    store_cart_total: "총금액",

    store_free_delivery_applied: "배달비 무료 적용 중",

    store_reviews_view_all_aria: "리뷰 전체 보기",

    store_order_count_badge: "주문 {count}",

    store_open_now: "영업중",

    store_preparing: "준비중",
    store_closed_now: "영업종료",
    store_resting_now: "휴식중",
    store_delivery_available: "배달가능",
    store_pickup_available: "픽업가능",
    store_visit_available: "방문가능",

    store_badge_delivery: "배달가능",

    store_badge_instant_discount: "즉시할인",

    store_badge_reservation: "예약가능",
    store_badge_recommended: "추천",
    store_badge_new_store: "신규",

    store_directions_google_aria: "구글 지도에서 내 위치에서 이 매장까지 길찾기",

    store_menu_search_aria: "메뉴 검색",

    store_more_aria: "더보기",

    store_fulfillment_mode_aria: "수령 방식",

    store_cart_saved_hint: "담아 둔 장바구니가 있으면 아래에서 열 수 있어요.",

    store_current_cart: "현재 카트",

    store_min_order: "최소 주문",

    store_current_items_total: "현재 상품 금액",

    store_shortfall_amount: "부족한 금액",

    store_add_friend_aria: "친구 추가",

    store_order_accepted: "주문이 접수되었습니다.",

    store_cart_empty: "장바구니가 비어 있어요",

    store_cart_empty_hint: "먹고 싶은 가게를 찾아보세요",

    store_qty_decrease_alt_aria: "수량 줄이기",

    store_qty_increase_alt_aria: "수량 늘리기",

    store_items_subtotal: "총상품금액",

    store_estimated_delivery_fee: "예상배달비",

    store_payment_due: "결제예정금액",

    store_free_delivery_progress_aria: "무료배달까지 주문 금액 진행률",

    store_fulfillment_mode: "수령 방식",

    store_payment_method_aria: "결제 방법",

    store_pickup_location: "픽업 장소 (매장 주소)",

    store_optional_suffix: " (선택)",

    store_delivery_address_loading: "배달 주소 정보를 불러오는 중입니다…",

    store_delivery_address_1_aria: "배달주소 1 (마이페이지) 선택",

    store_delivery_address_1: "배달주소 1",

    store_prep_time_store_basis: "매장 입력·조리 안내 기준",

    store_route_motorcycle_basis: "오토바이 경로 기준",

    store_order_detail_title: "주문 상세",

    store_progress_status: "진행 상태",

    store_store_inquiry_chat: "매장 문의 채팅",

    store_order_info: "주문 정보",

    store_request_label: "요청",

    store_menu_section: "메뉴",

    store_product_label: "상품",

    store_delivery_fee: "배달비",

    store_total: "합계",

    store_order_timeline_aria: "주문 진행 단계",

    store_order_timeline_buyer_desc:
      "주문접수부터 배달완료(또는 픽업완료)까지 4단계로 보여 드립니다. 매장에서 상태를 바꾸면 갱신되고 채팅에도 안내가 올라갑니다.",

    store_order_chat_buyer_hint:
      "주문 상태는 위 진행 상태에서 확인하고, 요청 사항이나 조율이 필요할 때만 채팅을 이용해 주세요.",

    store_open_store_inquiry: "매장 문의 열기",

    store_open_order_progress_chat: "주문 진행 채팅 열기",

    store_manage_in_my_orders: "내 주문 상세에서 관리하기",

    store_order_wrong_store: "이 매장의 주문이 아닙니다.",

    store_back_to_store_short: "← 매장",

    store_cart_address_row_loading: "주소 정보 표시 중…",

    store_cart_menu_options_total: "메뉴·옵션 합계",

    store_product_sheet_add_aria:
      "{label}, 카트 {count}개, 메뉴·옵션 합계 {amount}",

    store_product_sheet_add_aria_no_cart: "{label}, 메뉴·옵션 합계 {amount}",

    store_cod_with_partner: "착불 · {label}",

    store_min_order_short: "최소주문",

    store_est_prep_short: "예상 조리",

    store_region_label: "지역",

    store_go_checkout_aria: "주문 확인으로 이동",

    store_cart_preview_aria: "장바구니 미리보기",

    store_bottom_status_break: "준비중 · {detail}",
    store_bottom_status_closed: "지금은 준비 중이에요",
    store_bottom_status_delivery_open: "지금 배달 주문 가능해요",
    store_bottom_status_pickup_open: "지금 포장·픽업 주문 가능해요",
    store_bottom_fulfillment_delivery: "배달",
    store_bottom_fulfillment_pickup: "포장·픽업",
    store_bottom_cart_line_count: "담은 메뉴 {count}개",
    store_bottom_checkout_btn: "주문 확인",
    store_bottom_min_order_remaining: "최소주문까지 {amount} 남았어요",

    store_delivery_order_summary_aria: "배달·주문 요약",

    store_delivery_guide: "배달 안내",

    store_delivery_order_guide_title: "배달·주문 안내",

    store_inquiry_title: "문의",

    store_phone_inquiry: "전화 문의",

    store_info_aria: "매장 정보",

    store_info_title: "매장 정보",

    store_rating_label: "평점",

    store_favorites_label: "찜",

    store_recent_orders: "최근 주문",

    store_available: "이용 가능",

    store_info_card_sub: "주소 · 영업 · 안내",

    store_shop_info_title: "가게 정보",

    store_hours_weekday: "영업시간",

    store_hours_saturday: "토 영업시간",

    store_hours_sunday: "일 영업시간",

    store_closed_days: "휴무일",

    store_phone_number: "전화번호",

    store_location: "위치",

    store_neighborhood: "동네",

    store_delivery_pickup: "배달·픽업",

    store_delivery_time: "배달 시간",

    store_delivery_fee_notice: "배달비(안내)",

    store_delivery_region_guide: "배달·지역 안내",

    store_registered_updated: "등록·수정",

    store_intro_benefits_title: "소개글 및 혜택",

    store_no_intro: "등록된 소개글이 없습니다.",

    store_stats_title: "매장 통계",

    store_order_count_label: "주문수",

    store_recent_90_days: "(최근 90일)",

    store_review_count_label: "리뷰수",

    store_flyer_intro_title: "전단지·소개",

    store_link_copied: "링크를 복사했습니다.",

    store_order_summary_aria: "주문 요약",

    store_commerce_summary_aria: "최소주문·배달·준비·결제 요약",

    store_commerce_notice_prefix: "매장에 등록된 영업·결제·공지입니다. 주소·지도는 우측 ",
    store_commerce_notice_suffix: " 또는 상단 ⋯ 메뉴에서 열 수 있어요.",

    store_courier_cod: "배달 담당(착불)",

    store_navigating: "이동 중…",

    store_cart_empty_period: "장바구니가 비어 있어요.",

    store_cart_empty_add_menu: "매장 상세에서 메뉴를 담아 주세요.",

    store_owner_pick_aria: "사장님 추천",

    store_owner_pick_title: "사장님 추천",

    store_menu_category_aria: "메뉴 카테고리",

    store_menu_label: "메뉴",

    store_add_options: "옵션 추가",

    store_per_item: "1개당",

    store_menu_amount: "메뉴 금액",

    store_per_unit_suffix: "/개",

    store_quantity: "수량",

    store_order_total: "주문 합계",

    store_request_note: "요청사항",

    store_request_placeholder: "예: 덜 맵게, 양파 빼주세요",

    store_fix_modifier_selection: "옵션을 올바르게 선택해 주세요.",

    store_selected_options: "선택한 옵션",

    store_required_options_hint: "필수 옵션을 확인해 주세요.",

    store_request_placeholder_alt: "예) 국물 많이 주세요",

    store_order_contact_aria: "주문 연락처",

    store_pickup_time_placeholder: "픽업 시간 등",

    store_product_amount: "상품 금액",

    store_planned_order_total: "주문 예정 금액",

    store_notice_label: "공지",

    store_report_submitted: "신고가 접수되었습니다.",

    store_report_followup:

      "검토 후 필요 시 조치합니다. 허위 신고는 제재 대상이 될 수 있습니다.",

    store_report_reason: "사유",

    store_report_detail_label: "상세 내용 (최대 2000자)",

    store_report_detail_placeholder: "구체적으로 적어 주시면 검토에 도움이 됩니다.",

    store_invalid_address: "잘못된 주소입니다.",

    store_reviews_loading: "리뷰 불러오는 중…",

    store_no_reviews_yet: "아직 등록된 리뷰가 없습니다.",

    store_sort_recommended: "추천순",

    store_sort_latest: "최신순",

    store_sort_rating_high: "별점 높은순",

    store_sort_rating_low: "별점 낮은순",

    store_owner_reply_count: "사장님 댓글 {count}",

    store_no_matching_reviews: "조건에 맞는 리뷰가 없습니다.",

    store_owner_reply: "사장님 댓글",

    store_order_type_delivery: "배달",

    store_order_type_pickup: "픽업",

    store_review_report_btn: "신고",

    store_review_report_aria: "리뷰 신고하기",

    store_review_report_prompt: "신고 사유를 입력해주세요",

    store_review_report_submitted: "신고가 접수되었습니다.",

    store_review_menu_good: "맛있어요",

    store_review_menu_bad: "아쉬워요",

    store_cart_preview_none: "담긴 메뉴 없음",

    store_cart_items_kind: "· {count}종",

    store_cart_clearing: "비우는 중…",

    store_this_store: "이 가게",

    store_other_store: "다른 가게",

    store_added_to_cart_toast: "{title} 담았어요",

    store_menu_review_link: "메뉴 리뷰 {count}개 ›",

    store_product_price_label: "가격",

    store_product_price_before_options: "옵션을 추가하기 전 메뉴 금액입니다.",

    store_product_qty_label: "수량",

    store_product_qty_count: "{count}개",

    store_product_option_load_failed: "옵션 정보를 불러오지 못했습니다.",

    store_product_photo_disclaimer:
      "메뉴 사진은 연출된 이미지로 실제와 다를 수 있습니다.",

    store_product_photos_aria: "{title} 사진",

    store_product_delivery_min_order_heading: "배달 최소주문금액",

    store_product_cart_subtotal_line: "카트 합계 {amount}",

    store_product_line_amount_heading: "선택 금액",

    store_add_to_cart_with_amount: "{amount} 담기",

    store_add_to_cart_amount_aria: "{amount} 카트 담기",

    store_cart_conflict_processing: "처리 중…",

    store_cart_clear_title: "카트를 비울까요?",

    store_cart_clear_body: "담은 메뉴가 모두 삭제됩니다.",

    store_cart_clear_confirm: "비우기",

    store_cart_other_title: "카트에 다른 가게 메뉴가 있어요",

    store_cart_single_store_rule: "카트에는 한 가게 메뉴만 담을 수 있어요.",

    store_cart_current_label: "현재 카트",

    store_cart_pending_label: "담으려는 메뉴",

    store_cart_list_total: "합계",

    store_cart_view: "카트 보기",

    store_cart_replace_confirm: "카트 비우고 담기",

    store_cart_expired_toast: "이전에 담은 장바구니가 오래되어 비웠어요.",

    store_cart_summary_hint: "이 가게 메뉴만 함께 주문할 수 있어요.",

    store_cart_page_title: "카트",

    store_cart_fulfillment_select_hint: "수령방법을 선택해주세요",

    store_cart_add_menu: "메뉴 추가",

    store_cart_upsell_title: "함께 먹으면 좋아요",

    store_cart_line_request: "요청: {note}",

    store_manage_my_shop: "내 상점 관리",

    store_favorite_remove_aria: "찜 해제",

    store_favorite_add_aria: "찜하기",

    store_delivery_order_mode: "배달주문",

    store_pickup_order_mode: "픽업주문",

    store_delivery_tab: "배달",

    store_pickup_tab: "픽업",

    store_prep_time_label: "조리 시간",

    store_route_distance: "경로 거리",

    store_payment_methods_label: "결제방법",

    store_pickup_time_label: "픽업시간",

    store_location_guide: "위치안내",

    store_directions_btn: "길찾기",

    store_none: "없음",

    store_min_amount_or_more: "{amount} 이상",

    store_about_minutes: "약 {minutes}분",

    store_about_time: "약 {time}",

    store_cod_not_in_app: "앱 결제 금액에 포함되지 않습니다(착불)",

    store_app_delivery_zero: "앱 청구 배달비 0₱",

    store_free_delivery_over: "{amount} 이상 무료배달",

    store_fulfillment_mode_label: "수령 방식",

    store_optional_paren: "(선택)",

    store_contact_optional: "연락처",

    store_request_optional_label: "요청 사항 (선택)",

    store_product_request_optional: "상품 요청 (선택 · 가격에 반영되지 않음)",

    store_report_product: "상품 신고",

    store_add_to_cart: "장바구니 담기",

    store_view_order_history: "주문 내역 확인",

    store_view_order_progress: "이 주문 진행 보기",

    store_leave_store_inquiry: "매장 문의 남기기",

    store_order_flow_hint:
      "주문 접수와 상태 확인은 주문 상세에서 이어지고, 매장과 조율이 필요할 때만 배달채팅을 이용하면 됩니다. 금액 정산은 매장과 직접 하시면 됩니다.",

    store_reviews_total: "총 리뷰 {count}",

    store_review_preview_empty: "리뷰가 없습니다.",

    store_photo_reviews: "사진 리뷰",

    store_photo_reviews_only: "사진 리뷰만",

    store_photo_reviews_more_line1: "사진",

    store_photo_reviews_more_line2: "리뷰 더보기",

    store_photo_reviews_more_aria: "사진 리뷰 더보기",

    store_review_menu_entry_aria: "{name} 리뷰 보기",

    store_reviews_filter_all: "전체",

    store_reviews_with_count: "리뷰 {count}",

    store_star_points: "{star}점",

    store_member_fallback: "사마켓 회원",

    store_network_order_retry: "네트워크에 연결된 뒤 다시 주문해 주세요.",

    store_min_order_amount:
      "이 매장 최소 주문 금액은 {amount}입니다. 수량을 늘리거나 장바구니에서 합계를 맞춰 주세요.",

    store_err_out_of_stock: "재고가 부족합니다. 수량을 줄이거나 새로고침 후 다시 시도해 주세요.",
    store_err_out_of_stock_checkout: "장바구니에 재고가 부족한 메뉴가 있습니다. 수량을 줄이거나 장바구니를 수정해 주세요.",

    store_err_not_accepting: "이 매장은 현재 주문을 받지 않습니다.",

    store_err_preparing: "지금은 준비 중이라 주문할 수 없습니다.",

    store_err_below_minimum: "최소 주문 금액에 맞지 않습니다. 금액을 늘린 뒤 다시 시도해 주세요.",
    store_err_below_minimum_cart: "최소 주문 금액에 맞지 않습니다. 메뉴를 더 담아 주세요.",

    store_err_own_store: "본인 매장 상품은 주문할 수 없습니다.",

    store_err_required_options: "필수 옵션을 모두 선택해 주세요.",

    store_err_too_many_options: "옵션 선택 개수가 너무 많습니다.",

    store_err_invalid_option: "선택할 수 없는 옵션이 포함되어 있습니다.",

    store_err_option_mismatch: "옵션 정보가 맞지 않습니다. 새로고침 후 다시 시도해 주세요.",

    store_err_no_options: "이 상품은 옵션을 지원하지 않습니다. 새로고침 후 다시 시도해 주세요.",

    store_err_duplicate_option: "같은 옵션을 중복 선택했습니다.",

    store_err_duplicate_line: "주문에 같은 구성의 상품이 중복되었습니다.",

    store_err_order_failed: "주문에 실패했습니다. ({code})",

    store_err_cart_add_failed: "장바구니에 담을 수 없습니다.",

    store_options_add_amount: "옵션 추가 {amount}",

    store_stock_qty: "재고 {count}개",

    store_stock_untracked: "재고 확인 없음 · 수량 제한 없음",

    store_discount_applied: "{pct}% 할인 적용",

    store_stock_below_min: "재고가 최소 주문 수량({min}개)보다 적어 주문할 수 없습니다.",

    store_qty_min_max: "최소 {min}개 · 최대 {max}개",

    store_qty_min_max_stock: "최소 {min}개 · 최대 {max}개 (재고 {stock}개)",

    store_cod_label: "착불",

    store_free_delivery_threshold_met: "무료배달 기준({amount} 이상) 충족으로 배달비 면제",

    store_min_order_shortfall:
      "최소 주문 {min} 이상부터 주문할 수 있습니다. (부족 {short}) · 장바구니에 더 담거나 수량을 늘려 주세요.",

    store_order_info_loading: "주문 정보 불러오는 중…",
    store_order_info_unavailable: "주문 정보를 불러올 수 없습니다.",
    store_status_banner_dismiss_aria: "상태 배너 닫기",
    store_delivery_address_heading: "배달 주소",
    store_address_detail_line: "상세 : {detail}",
    store_delivery_fee_line: "배달비 : {amount}",
    store_order_payment_total_line: "주문 금액 합계 : {amount}",
    store_order_history_drawer_title: "주문 내역",
    store_order_history_panel_open_aria: "주문 내역 패널 열기",
    store_order_history_panel_close_aria: "주문 내역 패널 닫기",
    store_order_view_detail_btn: "주문상세",
    store_order_cancel_btn: "주문취소",
    store_order_drawer_menu_aria: "메뉴",
    store_chat_notify_on_aria: "채팅 알림음 켜짐 — 탭하면 끔",
    store_chat_notify_off_aria: "채팅 알림음 꺼짐 — 탭하면 켬",
    store_order_id_required: "주문 ID가 없습니다.",
    store_order_chat_open_failed_error: "주문 채팅을 열 수 없습니다. ({error})",
    store_orders_list_link: "주문 목록",
    store_server_config_required: "서버 설정이 필요합니다.",
    store_pickup_address_heading: "픽업 (매장 주소)",
    store_db_not_configured:
      "Supabase가 연결되지 않았거나 매장 테이블이 없습니다. SQL 마이그레이션을 적용해 주세요.",
    store_not_found_short: "매장을 찾을 수 없습니다.",
    store_back_to_store_list: "매장 목록으로",
    store_menu_blocked_break:
      "준비중 · Break time: {range}. 쉬는 시간에는 메뉴를 선택할 수 없습니다.",
    store_menu_blocked_hours:
      "지금은 영업 시간이 아니어서 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다.",
    store_menu_uncategorized: "기타 메뉴",
    store_item_type_menu: "메뉴",
    store_item_type_service: "서비스",
    store_item_type_product: "상품",
    store_recommended_menu_title: "추천 메뉴",
    store_popular_menu_title: "인기 메뉴",
    store_badge_menu_popular: "인기",
    store_badge_owner_recommended: "사장님 추천",
    store_badge_menu_representative: "대표",
    store_badge_menu_discount: "할인",
    store_home_delivery_fee_discount_title: "배달팁 할인",
    store_home_delivery_fee_discount_subtitle: "배달비 할인 혜택이 있는 매장",
    store_menu_sales_paused:
      "이 매장은 상품 판매 승인 전이거나 판매가 일시 중지된 상태입니다.",
    store_menu_search_no_results: "검색 결과가 없습니다.",
    store_menu_no_items_registered: "등록된 상품이 없습니다.",
    store_menu_select_blocked_default:
      "지금은 메뉴를 선택할 수 없습니다. 목록은 볼 수 있습니다.",
    store_add_to_cart_aria: "{title} 담기",
    store_menu_options_badge: "옵션",
    store_browse_meta_default: "매장 둘러보기",
    store_browse_meta_title_suffix: "{label} 매장",
    store_browse_meta_desc_sub: "{sub} {primary} 매장을 동네 기준으로 찾아보세요.",
    store_browse_meta_desc_primary: "{primary} 업종 매장을 동네 기준으로 찾아보세요.",
    store_report_store: "매장 신고",
    store_fallback_name: "매장",
    store_hub_owner_ops: "운영",
    store_hub_owner_ops_tasks_aria: "매장 운영 할 일 {count}건",
    store_hub_owner_ops_shortcut_aria: "매장 운영 바로가기",
    store_delivery_float_menu_aria: "배달 빠른 메뉴",
    store_delivery_fab_open_aria: "FAB 메뉴 펼치기",
    store_delivery_fab_close_aria: "FAB 메뉴 접기",
    store_delivery_fab_store: "스토어",
    store_delivery_fab_cart: "장바구니",
    store_delivery_fab_home: "배달 홈",
    store_delivery_float_order_history: "주문내역",
    store_delivery_float_order_chat: "주문채팅",
    store_delivery_float_register_store: "내 상점 등록",
    store_delivery_float_ops_center: "운영센터",
    store_delivery_dial_cart: "카트",
    store_delivery_dial_hub_aria: "{label} 퀵메뉴 허브",
    store_back_to_menu: "가게로 돌아가기",
    store_clear_cart_btn: "카트 비우기",
    store_order_accepting: "주문 가능",
    store_preparing_short: "준비 중",
    store_delivery_no_short: "배달 불가",
    store_delivery_yes_short: "배달 가능",
    store_delivery_fee_cod_line: "배달비 착불",
    store_delivery_fee_free_line: "배달비 무료",
    store_free_delivery_short: "무료배달",
    store_delivery_fee_inquire_line: "배달비 문의",
    store_delivery_fee_amount_line: "배달비 {amount}",
    store_delivery_fee_courier_colon: "배달비: {label}",
    store_eta_about_label: "약 {label}",
    store_eta_about_minutes: "약 {minutes}분",
    store_eta_prep_about: "조리 약 {prep}",
    store_eta_delivery_about_minutes: "배달 약 {minutes}분",
    store_eta_prep_delivery_about_minutes: "{prep} · 배달 약 {minutes}분",
    store_eta_prep_delivery_manual: "{prep} · 배달 {manual}",
    store_eta_delivery_manual: "배달 {manual}",
    store_eta_prep_delivery_dash: "{prep} · 배달 —",
    store_eta_delivery_dash: "배달 —",
    store_prep_minutes_unit: "{minutes}분",
    store_return_to_store: "매장으로 돌아가기",
    store_browse_stores: "가게 둘러보기",
    store_more_menu_at_store: "이 가게 메뉴 더 보기",
    store_change_options: "옵션 변경",
    store_cart_other_buckets_hint:
      "다른 매장 장바구니도 있습니다. 해당 매장 페이지에서 장바구니를 열 수 있어요.",
    store_discount_amount: "할인금액",
    store_min_order_amount_colon: "최소 주문 금액 : {amount}",
    store_free_delivery_met: "무료배달 조건을 충족했습니다.",
    store_free_delivery_remaining: "{amount} 더 담으면 배달비가 면제될 수 있어요.",
    store_delivery_fee_estimate_hint:
      "배달을 선택하면 매장에 설정된 예상 배달비가 위 요약에 반영됩니다.",
    store_min_order_met: "최소 주문 금액을 충족했습니다.",
    store_min_order_add_more: "{amount} 더 담아 최소 주문을 맞춰 주세요.",
    store_fulfillment_mode_unavailable:
      "이 매장의 「서비스 형태」에서 포장 픽업과 배달이 모두 꺼져 있거나, 담긴 상품과 맞지 않아 수령 방식을 고를 수 없습니다. 매장 설정을 확인하거나 항목을 조정한 뒤 다시 시도해 주세요.",
    store_fulfillment_all_items_blocked:
      "담긴 상품은 포장 픽업·배달 모두 불가로 표시되어 있습니다. 항목을 삭제한 뒤 다시 담아 주세요.",
    store_payment_method_required: "결제 방법",
    store_pickup_address_at_store_hint:
      "이 주소에서 수령합니다. 배달을 고르면 아래에 입력하는 주소가 배달지로 전달됩니다.",
    store_pickup_address_missing:
      "매장 주소가 비어 있어 픽업 장소를 표시할 수 없습니다. 사장님 메뉴에서 매장 기본 정보를 등록해 주세요.",
    store_label_store_info: "매장 정보",
    store_label_delivery_address: "배송지",
    store_cart_login_for_saved_address:
      "로그인하면 마이페이지에 저장한 배달 주소를 여기서 선택할 수 있습니다.",
    store_cart_legacy_address_notice:
      "예전 장바구니에만 있던 배송지 {count}건은 저장되지 않습니다.",
    store_address_manage_link: "주소 관리",
    store_cart_legacy_address_suffix: "에서 Google 검색 주소를 저장한 뒤 다시 선택해 주세요.",
    store_cart_profile_default_delivery: "내정보 · 주소 관리 기본 배달",
    store_cart_no_saved_delivery_address:
      "마이페이지에 저장된 배달 주소가 없습니다. 프로필에서 입력하거나 주소 관리에서 저장 주소를 추가하세요.",
    store_cart_address_check_before_order: "주문 전 지역·주소 한 줄이 3자 이상인지 확인해 주세요.",
    store_cart_saved_address_aria: "{label}, 저장 주소 {index} 선택",
    store_cart_profile_address_manage: "내정보 · 주소 관리",
    store_cart_save_from_address_manage: "주소 관리에서 저장",
    store_cart_pick_or_register_delivery: "배달 주소를 선택하거나 등록해 주세요.",
    store_cart_verify_delivery_address:
      "선택한 배송지 내용을 확인해 주세요. 지역·동네 또는 {streetLabel}이 필요합니다.",
    store_cart_address_too_short:
      "마이페이지 주소가 비어 있거나 너무 짧습니다. 프로필에서 입력을 마치거나",
    store_cart_address_add_suffix: "에서 저장 주소를 추가해 주세요.",
    store_cart_eta_ref: "예상 도착(참고): {label}",
    store_cart_eta_manual_hint: "매장 설정에서 수기 배달 시간을 입력하면 여기에 표시됩니다.",
    store_cart_eta_confirm: "예상 도착(참고) 확인",
    store_cart_other_store_carts_prefix: "다른 매장(",
    store_cart_other_store_carts_suffix:
      ") 장바구니가 있습니다. 해당 매장 장바구니를 비우거나 주문한 뒤 이 매장을 이용해 주세요.",
    store_cart_clear_this_store: "이 매장 비우기",
    store_cart_open_cart: "장바구니 열기",
    store_cart_items_line: "{name} · 상품 {count}종 · {amount}",
    store_submit_store_delivery: "가게배달 주문하기",
    store_min_order_match_short: "최소 주문 금액 {amount} 이상으로 맞춰 주세요.",
    store_err_pickup_combo: "이 매장·장바구니 조합에서는 포장 픽업을 선택할 수 없습니다.",
    store_err_delivery_not_offered: "이 매장에서는 배달을 제공하지 않습니다. 수령 방식을 바꿔 주세요.",
    store_err_shipping_items_in_cart: "장바구니 품목 중 배달(배송)이 불가한 상품이 있습니다.",
    store_err_region_only_address:
      "주소: 지역만 고른 배달주소는 주문할 수 없습니다. 해당 항목을 삭제한 뒤 배송지 추가에서 동네까지 선택해 주세요.",
    store_err_select_delivery_address:
      "배달: 마이페이지 주소를 확인하거나 배송지 추가 후, 라디오로 배달 주소를 선택해 주세요.",
    store_err_saved_address_required:
      "배달: 저장된 주소를 선택해 주세요. 주소 관리를 통해 검색 주소를 저장한 뒤 주문할 수 있습니다.",
    store_err_delivery_address_incomplete:
      "배달: 선택한 배달주소에 지역·동네 또는 {streetLabel}(3자 이상)이 필요합니다. 다른 배달주소를 선택하거나 마이페이지에서 주소를 저장해 주세요.",
    store_checkout_phone_partial: "{phone} (입력 미완성)",
    store_checkout_not_entered: "(미입력)",
    store_err_payment_method:
      "결제 방법을 확인해 주세요. 매장에서 허용한 수단만 선택할 수 있습니다.",
    store_err_delivery_address_required: "배달·배송 주소를 입력해 주세요.",
    store_err_pickup_disabled: "이 매장은 포장 픽업 주문을 받지 않습니다. 수령 방식을 바꿔 주세요.",
    store_err_delivery_disabled: "이 매장은 배달을 제공하지 않습니다. 수령 방식을 바꿔 주세요.",
    store_err_delivery_out_of_range: "선택하신 주소는 이 매장의 배달 가능 거리를 벗어났습니다.",
    store_err_delivery_store_coords_required:
      "이 매장은 배달 위치가 아직 등록되지 않아 배달 주문을 받을 수 없습니다.",
    store_err_delivery_customer_coords_required:
      "배달 주소에 위치 좌표가 없습니다. 주소를 다시 저장해 주세요.",
    store_view_menu_link: "{storeName} 메뉴 보기",
    store_checkout_request_owner_hint:
      "입력하시면 매장 사장님 주문 관리 화면에 '고객 요청 사항'으로 표시됩니다.",
    store_delivery_courier_line: "배달 업체(안내): {label}",
    store_err_mixed_store_cart: "한 번에 한 매장의 메뉴만 주문할 수 있습니다.",
    store_err_sold_out_in_cart: "품절된 메뉴가 포함되어 있습니다. 장바구니를 수정해 주세요.",
    store_err_product_stopped_in_cart: "판매 중지된 메뉴가 포함되어 있습니다. 장바구니를 수정해 주세요.",
    store_err_price_changed_cart: "메뉴 가격이 변경되어 장바구니를 다시 확인해 주세요.",
    store_err_required_option_changed_cart:
      "필수 옵션이 변경되었습니다. 장바구니를 다시 확인해 주세요.",
    store_err_delivery_region_city_required: "배달 지역(지역/도시)을 선택해 주세요.",
    store_err_delivery_address_invalid:
      "선택한 배달 주소를 찾을 수 없거나 본인 주소가 아닙니다.",
    store_err_payment_method_select: "결제 방법을 선택해 주세요.",
    store_owner_notifications_title: "알림",
    store_owner_notification_settings_title: "알림 설정",
    store_owner_slug_not_found: "등록된 매장을 찾을 수 없습니다. 주소(slug)를 확인해 주세요.",
    store_owner_go_order_management: "주문 관리로",
    store_owner_notif_login_only: "로그인한 사장님 계정에서만 알림 설정을 바꿀 수 있어요.",
    store_owner_notif_table_missing: "알림 설정 테이블이 아직 없습니다.",
    store_owner_notif_load_failed: "설정을 불러오지 못했습니다.",
    store_owner_notif_settings_link_suffix: "에서 거래·커뮤니티 채팅 알림을 함께 조정할 수 있어요.",
    store_owner_notif_order_label: "주문 알림",
    store_owner_notif_order_desc: "신규 주문·취소·환불·결제 등",
    store_owner_notif_store_label: "매장·판매 알림",
    store_owner_notif_store_desc: "매장 운영 관련 인앱 알림",
    store_owner_notif_sound: "인앱 알림음",
    store_owner_notif_vibration: "진동",
    store_owner_status_pending: "신규",
    store_owner_status_accepted: "주문확인",
    store_owner_status_preparing: "상품준비",
    store_owner_status_ready_for_pickup: "픽업준비",
    store_owner_status_delivering: "배송중",
    store_owner_status_arrived: "배송지도착",
    store_owner_status_completed: "주문완료",
    store_owner_status_cancel_requested: "취소요청",
    store_owner_status_cancelled: "취소",
    store_owner_status_refund_requested: "환불요청",
    store_owner_status_refunded: "환불완료",
    store_owner_tab_all: "전체",
    store_owner_tab_new: "신규",
    store_owner_tab_active: "진행중",
    store_owner_tab_done: "완료",
    store_owner_tab_issue: "취소·문제",
    store_owner_tab_issue_short: "취소·환불",
    store_owner_transition_accepted: "접수확인",
    store_owner_transition_preparing: "조리중",
    store_owner_transition_ready: "포장완료",
    store_owner_transition_delivering: "배달출발",
    store_owner_transition_arrived: "도착",
    store_owner_transition_completed: "배달완료",
    store_owner_action_reject_order: "주문 거절",
    store_owner_action_cancel_order: "주문 취소",
    store_owner_action_applied: "{label} 반영됨",
    store_owner_refund_requested_notice:
      "구매자가 환불을 요청했습니다. 비즈니스 콘솔 또는 관리자 처리 흐름을 이용해 주세요.",
    store_owner_refunded_notice: "환불 처리된 주문입니다.",
    store_owner_no_permission: "이 매장에 대한 오너 권한이 없습니다.",
    store_owner_store_load_failed: "매장 정보를 불러오지 못했습니다.",
    store_owner_refresh: "새로고침",
    store_owner_timeline_status_change: "상태 변경",
    store_owner_order_placed_at: "주문시각",
    store_owner_eta_recalc_hint:
      "주문자·매장 주소가 바뀌면 자동으로 다시 계산됩니다. 실제 소요는 교통·매장 상황에 따라 달라질 수 있습니다.",
    store_owner_courier_fee_notice:
      "안내 문구이며, 상품·배달비 합계와 별도로 청구되지 않습니다.",
    store_shipping_fee: "배송비",
    store_fee_other: "기타",
    store_owner_notif_login_to_view: "로그인한 뒤 알림을 확인하세요.",
    store_owner_notif_tab_all: "전체",
    store_owner_notif_group_new_orders: "신규 주문",
    store_owner_notif_group_cancel_payment: "취소·결제",
    store_owner_notif_group_refund: "환불",
    store_owner_notif_mark_all_read: "이 매장 알림 모두 읽음",
    store_owner_notif_mark_all_busy: "처리 중…",
    store_owner_notif_empty: "알림이 없어요.",
    store_owner_notif_inbox_unread: "읽지 않은 알림 {count}건",
    store_owner_notif_order_no_label: "주문번호 {orderNo}",
    store_owner_notif_view_order: "주문 보기",
    store_owner_notif_mark_read: "읽음",
    store_owner_notif_settings_link: "알림 설정",
    store_owner_notif_all_link: "전체 알림",
    store_owner_view_detail: "상세보기",
    store_owner_customer_inquiry: "고객 문의",
    store_owner_order_items_loading: "주문 품목을 불러오는 중…",
    store_owner_reject_after_accept_warn:
      "이미 접수한 주문입니다. 거절 시 고객 불만·환불 이슈가 생길 수 있습니다.",
    store_owner_reject_confirm: "거절 확정",
    store_owner_order_not_found: "주문을 찾을 수 없습니다.",
    store_owner_back_to_list: "목록으로",
    store_owner_back_to_store: "매장으로",
    store_owner_chats_loading: "불러오는 중…",
    store_owner_chats_login_hint: "로그인 후 주문 채팅과 주문 현황을 바로 확인할 수 있습니다.",
    store_owner_chats_login_cta: "로그인하고 주문 보기",
    store_owner_chats_retry: "다시 시도",
    store_owner_chats_no_store: "이 주소의 매장을 찾을 수 없거나 권한이 없습니다.",
    store_owner_chats_business_orders: "사업자 주문함",
    store_owner_chats_title: "주문 채팅",
    store_owner_chats_open_delivery: "배달 채팅함 열기",
    store_owner_chats_go_orders: "주문 관리로",
    store_owner_chats_need_store: "매장을 선택한 뒤 다시 시도해 주세요.",
    store_owner_chats_list_hint: "{storeName} · 이 매장 주문에 연결된 채팅만 표시합니다.",
    store_owner_chats_empty_title: "주문 채팅이 없습니다",
    store_owner_chats_empty_hint: "주문이 들어오면 채팅방이 여기에 표시됩니다.",
    store_owner_step_confirm_title: "진행 단계 변경",
    store_owner_open_chat_btn: "채팅 하기",
    store_owner_chat_connecting: "채팅방 연결 중…",
    store_owner_back_to_orders: "주문 관리로 돌아가기",
    store_owner_buyer_note_title: "특이사항",
    store_owner_open_in_messenger: "메신저에서 열기",
    store_owner_view_order_detail_short: "주문 상세 보기",
    store_owner_inquiry_shortcut: "문의함",
    store_owner_notif_bell: "알림",
    store_owner_notif_bell_refund: "알림 · 환불요청 {count}건",
    store_owner_notif_refund_link: "환불 요청 {count}건 ·",
    store_owner_notif_go_orders: "주문 관리",
    store_owner_tab_empty: "이 탭에 표시할 주문이 없습니다.",
    store_owner_problem_order_hint:
      "관리자 검토용 메모가 저장됩니다. (샘플: 주문 상태가 환불 요청으로 바뀝니다.)",
    store_owner_err_server_config: "서버 설정을 확인해 주세요.",
    store_owner_err_load_list: "목록을 불러오지 못했습니다.",
    store_owner_err_network: "네트워크 오류",
    store_biz_chat_connect: "채팅 연결",
    store_biz_payment_line: "결제 {payment}",
    store_biz_platform_locked: "플랫폼 잠금",
    store_biz_prep_delayed: "준비 지연",
    store_biz_refund_badge: "환불 요청",
    store_biz_accepted_prefix: "접수",
    store_biz_auto_complete_at: "자동 완료 예정: {at}",
    store_biz_tab_cancelled: "취소",
    store_biz_login_view_orders: "로그인하고 주문 보기",
    store_biz_apply_store: "매장 신청",
    store_biz_retry: "다시 시도",
    store_biz_badge_delivery_waiting: "배달 대기 {count}",
    store_biz_badge_accept_waiting: "접수 대기 {count}",
    store_biz_badge_refund_count: "환불 요청 {count}건",
    store_biz_pending_accept_banner: "접수 대기 중인 주문이 {count}건 있습니다.",
    store_biz_refund_admin_banner:
      "구매자 환불 요청이 접수된 주문이 있습니다. 관리자에서 승인 시 상태가 갱신됩니다.",
    store_biz_view_operations: "매장 운영 보기",
    store_biz_check_store_info: "매장 정보 점검",
    store_biz_sla_pending_over_5m: "주문 방치",
    store_biz_sla_eta_overdue: "ETA 초과",
    store_biz_sla_delivery_over_60m: "장기 배송",
    store_biz_sla_unassigned_over_10m: "미배차",
    store_biz_sla_refund_overdue: "환불 지연",
    store_biz_sla_admin_attention: "운영 확인중",
    store_biz_sla_level: "SLA {level}",
    store_biz_patch_err_prep_minutes: "예상 준비 시간(1–180분)을 선택해 주세요.",
    store_biz_patch_err_invalid_transition: "지금 단계에서는 해당 처리를 할 수 없습니다.",
    store_biz_patch_err_stale_reconciled: "이미 처리된 주문입니다. 화면을 맞췄습니다.",
    store_biz_patch_err_admin_locked: "플랫폼에서 이 주문을 잠갔습니다. 운영센터로 문의해 주세요.",
    store_biz_patch_err_cancel_reason_required: "취소 사유를 선택해 주세요.",
    store_biz_patch_err_points_insufficient:
      "Business Credit가 부족해 주문을 수락할 수 없습니다. 충전 후 다시 시도해 주세요.",
    store_biz_refund_requested_owner_notice:
      "구매자가 환불을 요청했습니다. 관리자 화면(배달 주문)에서 승인하면 재고·정산이 반영됩니다.",
    store_biz_delivery_actions_title: "배달·주문 처리",
    store_biz_delivery_actions_hint:
      "진행 단계 변경·주문취소는 채팅과 함께 이곳에서 할 수 있습니다. ({status})",
    store_biz_modal_delivery_hint:
      "배달·접수 처리는 여기서 진행하고, 주문 전문·채팅 전송은 우측 ⋯에서 확인하세요.",
    store_biz_refund_requested_banner: "환불 요청됨 — 관리자 배달 주문에서 승인 시 반영됩니다.",
    store_messenger_order_fallback: "배달·매장 주문",
    store_messenger_order_title: "{store} · 주문 {orderNo}",
    store_messenger_list_order_no: "주문번호 {orderNo}",
    store_messenger_delivery_order_title: "배달 주문",
    store_messenger_progress_drawer_title: "주문 진행 상황",
    store_messenger_chrome_order_btn: "주문",
    store_messenger_chrome_history_btn: "내역",
    store_delivery_chat_placeholder_buyer: "주문 관련 요청을 입력하세요",
    store_delivery_chat_placeholder_owner: "운영 안내를 입력하세요",
    store_delivery_chat_input_placeholder: "메시지",
    store_delivery_chat_quick_replies_aria: "빠른 답장",
    store_delivery_chat_quick_confirm: "네, 확인했습니다",
    store_delivery_chat_quick_door: "문 앞에 두어 주세요",
    store_delivery_chat_quick_address: "주소 설명 드릴게요",
    store_delivery_chat_quick_call: "전화 주세요",
    store_delivery_ops_title_pending: "신규 주문",
    store_delivery_ops_title_accepted: "주문 접수",
    store_delivery_ops_title_preparing: "조리 시작",
    store_delivery_ops_title_ready: "조리 완료",
    store_delivery_ops_title_delivering: "배달 시작",
    store_delivery_ops_title_arrived: "도착",
    store_delivery_ops_title_completed: "완료",
    store_delivery_ops_title_warning: "주의",
    store_delivery_ops_title_progress: "주문 진행",
    store_delivery_ops_body_accepted: "주문을 접수했습니다.",
    store_delivery_ops_body_accepted_prep: "주문을 접수했습니다. 예상 준비 시간은 약 {minutes}분입니다.",
    store_delivery_ops_body_preparing: "주문을 준비(조리)하고 있습니다.",
    store_delivery_ops_body_ready_delivery: "준비가 완료되었습니다. 곧 배달을 시작합니다.",
    store_delivery_ops_body_ready_pickup: "준비가 완료되었습니다. 매장에서 픽업해 주세요.",
    store_delivery_ops_body_delivering: "배달을 시작했습니다.",
    store_delivery_ops_body_completed_delivery: "배달이 완료되었습니다.",
    store_delivery_ops_body_completed_pickup: "주문이 완료되었습니다. 픽업해 주세요.",
    store_delivery_ops_body_generic: "주문 상태가 업데이트되었습니다.",
    store_messenger_order_in_progress: "주문 진행중",
    store_messenger_cancel_failed: "취소에 실패했습니다.",
    store_messenger_store_address_label: "매장 주소",
    store_messenger_receipt_order_delivery: "배달주문",
    store_messenger_receipt_order_pickup: "포장·픽업주문",
    store_messenger_receipt_order_line: "주문 {orderNo}",
    store_messenger_receipt_items_heading: "주문 품목",
    store_messenger_receipt_col_item: "품목",
    store_messenger_receipt_col_option: "옵션",
    store_messenger_receipt_col_qty: "수량",
    store_messenger_receipt_col_amount: "금액",
    store_messenger_receipt_no_items: "품목 정보가 없습니다.",
    store_messenger_receipt_payment_total: "결제금액",
    store_messenger_receipt_payment_method: "결제방법",
    store_messenger_receipt_prep_time: "예상 준비 시간",
    store_messenger_receipt_prep_minutes: "약 {minutes}분",
    store_messenger_timeline_in_progress: "진행중",
    store_messenger_timeline_scheduled: "예정",
    store_messenger_owner_next_label: " → 다음: {label}",
    store_messenger_owner_accept_prompt: "주문 접수 여부를 선택하세요.",
    store_messenger_owner_progress_prompt: "아래 버튼으로 다음 진행 상황을 입력하세요.",
    store_messenger_owner_status_locked: "이 단계에서는 채팅에서 상태를 바꿀 수 없습니다.",
    store_messenger_buyer_step_new: "신규",
    store_messenger_buyer_step_accepted: "접수",
    store_messenger_buyer_step_preparing: "조리",
    store_messenger_buyer_step_delivery_ready: "배달준비",
    store_messenger_buyer_step_delivering: "배달중",
    store_messenger_buyer_step_near_address: "주소근처",
    store_messenger_buyer_step_completed: "완료",
    store_messenger_buyer_step_pickup_ready: "픽업준비",
    store_messenger_buyer_step_pickup_done: "수령완료",
    store_messenger_progress_step_new_order: "신규주문",
    store_messenger_progress_step_accepted: "주문접수",
    store_messenger_progress_step_preparing: "조리중",
    store_messenger_progress_step_delivery_ready: "배달준비",
    store_messenger_progress_step_delivering: "배달중",
    store_messenger_progress_step_near_address: "주소근처",
    store_messenger_progress_step_done: "완료",
    store_messenger_progress_step_pickup_ready: "픽업준비",
    store_messenger_progress_step_pickup_done: "수령완료",
    store_search_chip_chicken: "치킨",
    store_search_chip_pizza: "피자",
    store_search_chip_korean: "한식",
    store_search_chip_bunsik: "분식",
    store_search_chip_cafe: "카페",
    store_search_chip_lunchbox: "도시락",
    store_search_chip_mart: "마트",
    store_search_chip_jokbal: "족발",
    store_search_chip_latenight: "야식",
    store_search_chip_free_delivery: "무료배달",
    store_biz_my_store_fallback: "내 매장",
    store_biz_order_chat_modal_body:
      "배달·매장 주문 대화는 `/community-messenger/delivery-chats`와 메신저 방에서 이어집니다.",
    store_pay_label_cod: "COD",
    store_pay_label_gcash: "GCash",
    store_pay_label_bank_transfer: "계좌이체",
    store_pay_label_other: "기타",
    store_pay_label_card_on_delivery: "카드(배달 시 결제)",
    store_pay_display_cash_meet: "COD",
    store_pay_methods_fallback: "GCash · COD 등 (매장 확인)",
    store_owner_mobile_filter_all_types: "전체 유형",
    store_owner_mobile_filter_delivery_only: "배달만",
    store_owner_mobile_filter_pickup_only: "포장만",
    store_owner_mobile_kpi_new: "신규 주문",
    store_owner_mobile_kpi_preparing: "준비(조리)중",
    store_owner_point_title: "Business Credit",
    store_owner_point_balance_label: "보유 Business Credit",
    store_owner_point_blocked_badge: "주문 차단",
    store_owner_point_blocked_message:
      "Business Credit가 부족해 지금은 새 주문을 받을 수 없습니다. 고객 화면에는 준비중으로 표시됩니다.",
    store_owner_point_charge_cta: "Business Credit 충전 신청",
    store_owner_point_account_cta: "입금 계좌 문의",
    store_owner_point_section_account: "입금 계좌 문의",
    store_owner_point_section_charge: "Business Credit 충전 신청",
    store_owner_point_balance_current: "현재 보유 Business Credit",
    store_owner_point_charge_ratio_hint: "충전 Business Credit와 입금 금액은 1:1로 적용됩니다.",
    store_owner_point_inquiry_cta: "관리자 문의",
    store_owner_point_ledger_title: "최근 내역",
    store_owner_point_ledger_empty: "Business Credit 내역이 없습니다.",
    store_owner_point_estimated_orders: "예상 수락 가능",
    store_owner_point_estimated_orders_unit: "약 {count}건",
    store_owner_point_charge_title: "Business Credit 충전",
    store_owner_point_charge_amount: "충전 Business Credit",
    store_owner_point_charge_payment: "입금 금액 (PHP)",
    store_owner_point_charge_depositor: "입금자명",
    store_owner_point_charge_bank: "은행",
    store_owner_point_charge_receipt: "영수증 URL",
    store_owner_point_charge_memo: "메모",
    store_owner_point_charge_submit: "충전 신청",
    store_owner_point_charge_pending: "승인 대기 중",
    store_owner_point_charge_on_hold: "관리자 확인 중(보류)입니다. 추가 신청은 완료 후 가능합니다.",
    store_owner_point_entry_store_order_fee: "주문 수수료",
    store_owner_point_entry_store_charge: "충전",
    store_owner_point_entry_admin_adjust: "관리자 조정",
    store_owner_point_step_account: "1. 입금 계좌 문의",
    store_owner_point_step_awaiting: "2. 계좌 안내 대기",
    store_owner_point_step_deposit: "3. 입금 신청",
    store_owner_point_step_charge_pending: "입금 승인 대기",
    store_owner_point_account_inquiry_intro:
      "입금 계좌가 필요하면 아래 버튼으로 문의해 주세요. 충전 신청과 별도로 처리됩니다.",
    store_owner_point_account_inquiry_submit: "입금 계좌 문의하기",
    store_owner_point_account_inquiry_pending: "관리자가 입금 계좌를 안내할 때까지 기다려 주세요.",
    store_owner_point_account_answer_title: "입금 계좌 안내",
    store_owner_point_account_answer_hint: "관리자가 안내한 계좌 정보입니다.",
    store_owner_point_account_inquiry_already_open: "이미 계좌 문의가 접수되어 있습니다.",
    store_owner_point_deposit_blocked_hint: "입금 계좌 안내를 받은 뒤 충전 신청이 가능합니다.",
    store_owner_point_charge_history_title: "충전 신청 내역",
    store_owner_point_charge_history_empty: "충전 신청 내역이 없습니다.",
    store_owner_point_charge_status_pending: "승인 대기",
    store_owner_point_charge_status_waiting: "입금 확인 중",
    store_owner_point_charge_status_approved: "승인 완료",
    store_owner_point_charge_status_rejected: "반려",
    store_owner_point_charge_status_hold: "보류",
    store_owner_point_inquiry_status_open: "답변 대기",
    store_owner_point_inquiry_status_answered: "답변 완료",
    store_owner_point_inquiry_status_closed: "종료",
    store_owner_point_err_account_inquiry_required: "먼저 입금 계좌 문의를 진행해 주세요.",
    store_owner_point_err_account_inquiry_not_answered: "관리자 계좌 안내를 받은 뒤 입금 신청할 수 있습니다.",
    store_owner_point_err_charge_already_pending: "승인 대기 중인 충전 신청이 있습니다.",
    store_owner_point_err_account_inquiry_already_open: "이미 접수된 계좌 문의가 있습니다.",
    store_owner_point_err_platform_unavailable: "Business Credit 기능을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
    store_owner_point_err_point_amount_required: "충전 Business Credit를 1 이상 입력해 주세요.",
    store_owner_point_err_depositor_name_required: "입금자명을 입력해 주세요.",
    store_owner_point_err_subject_required: "제목과 내용을 입력해 주세요.",
    store_owner_point_dashboard_awaiting_account: "입금 계좌 안내를 기다리는 중입니다.",
    store_owner_point_dashboard_charge_pending: "충전 승인 대기 중입니다.",
    store_err_point_blocked: "지금은 준비 중이라 주문할 수 없습니다.",
    store_owner_mobile_kpi_delivering: "배달중",
    store_owner_mobile_kpi_done_today: "오늘 완료",
    store_owner_mobile_search_placeholder: "주문번호·구매자·전화번호 검색",
    store_owner_mobile_sort_newest: "최신순 ▾",
    store_owner_mobile_sort_oldest: "오래된순 ▾",
    store_owner_mobile_empty_title: "표시할 주문이 없습니다",
    store_owner_mobile_empty_hint: "다른 탭을 선택하거나 필터를 바꿔 보세요.",
    store_owner_orders_deeplink_miss_title: "알림의 주문을 찾을 수 없습니다",
    store_owner_orders_deeplink_miss_body:
      "이미 완료·취소되었거나 목록이 아직 갱신되지 않았을 수 있어요. 새로고침하거나 다른 탭에서 확인해 보세요.",
    store_owner_orders_deeplink_miss_refresh: "목록 새로고침",
    store_owner_orders_deeplink_miss_try_tab: "{tab} 탭에서 보기",
    store_owner_orders_deeplink_wrong_tab_title: "다른 탭에 있는 주문입니다",
    store_owner_orders_deeplink_wrong_tab_body:
      "알림 링크의 탭과 주문 상태가 맞지 않을 수 있어요. 아래에서 올바른 탭으로 이동해 주세요.",
    store_owner_orders_deeplink_wrong_tab_open: "{tab} 탭에서 열기",
    store_owner_mobile_aria_search: "주문 검색",
    store_owner_mobile_aria_filter: "주문 필터",
    store_owner_fulfillment_pickup_short: "포장",
    store_owner_fulfillment_delivery_short: "배달",
    store_owner_order_type_delivery: "배달 주문",
    store_owner_order_type_pickup: "포장 주문",
    store_owner_order_detail_title: "주문 상세",
    store_owner_order_detail_loading: "주문 정보를 불러오는 중…",
    store_owner_order_info_section: "주문 정보",
    store_owner_order_type_label: "주문 유형",
    store_owner_payment_method_label: "결제 방법",
    store_owner_payment_amount_label: "결제 금액",
    store_owner_order_time_label: "주문 시간",
    store_owner_prep_estimate_label: "예상 조리",
    store_owner_prep_about_minutes: "약 {minutes}분",
    store_owner_delivery_address_section: "배송지",
    store_owner_order_menu_section: "주문 메뉴",
    store_owner_order_line_short: "주문 {no}",
    store_owner_order_chat_line: "{orderNo} · {storeName}",
    store_owner_order_fallback: "주문",
    store_owner_store_fallback: "매장",
    store_owner_elapsed_hours: "{hours}시간 {minutes}분 경과",
    store_owner_elapsed_minutes: "{minutes}분 {seconds}초 경과",
    store_owner_timeline_refund_pending: "환불 요청 처리 중입니다.",
    store_owner_timeline_refund_done: "환불 완료된 주문입니다.",
    store_owner_timeline_cancelled: "취소된 주문입니다.",
    store_owner_cancel_order_btn: "주문취소",
    store_owner_cancel_request_btn: "취소요청",
    store_owner_cancel_sheet_title: "주문 취소",
    store_owner_cancel_request_sheet_title: "취소 요청",
    store_owner_cancel_sheet_desc: "취소 사유를 선택해 주세요. 조리 시작 전 주문은 바로 취소됩니다.",
    store_owner_cancel_request_sheet_desc:
      "조리가 시작된 주문은 즉시 취소되지 않을 수 있습니다. 관리자 확인 후 처리됩니다.",
    store_owner_cancel_requested_notice: "취소 요청이 접수되었습니다. 관리자 확인 후 처리됩니다.",
    store_owner_cancel_policy_direct: "이 주문은 매장에서 취소할 수 있습니다.",
    store_owner_cancel_policy_request: "조리가 시작된 주문은 취소 요청만 가능합니다.",
    store_owner_cancel_policy_admin_review: "관리자 확인 후 처리됩니다.",
    store_owner_cancel_policy_picked_up: "이미 픽업된 주문은 고객센터를 통해 처리됩니다.",
    store_owner_cancel_policy_terminal: "이미 취소·환불 처리 중인 주문입니다.",
    store_owner_order_card_actions_aria: "주문 카드 작업",
    store_owner_aria_order_detail: "주문 상세",
    store_owner_aria_back_orders: "주문 관리로 돌아가기",
    store_owner_aria_order_chat: "주문 채팅",
    store_owner_aria_exit_orders: "주문 관리로 나가기",
    store_owner_aria_dashboard: "대시보드로",
    store_owner_aria_open_menu: "메뉴 열기",
    store_owner_aria_exit_delivery_home: "배달 홈으로 나가기",
    store_owner_aria_store_ops: "매장 운영 상태",
    store_owner_aria_select_store: "매장 선택",
    store_owner_aria_notifications: "알림 {count}건",
    store_owner_aria_notifications_unread_only: "읽지 않은 알림",
    store_owner_ops_open: "영업중",
    store_owner_ops_paused: "일시중지",
    store_owner_ops_prep_minutes: "예상조리 {minutes}분",
    store_owner_ops_set_hours: "영업 시간을 설정해 주세요",
    store_owner_expand_ops_menu: "운영 메뉴 펼치기",
    store_owner_my_home_link: "← 내 정보(홈)",
    store_owner_order_progress_chat_title: "주문 진행 채팅",
    store_owner_ops_order_chat_label: "운영형 주문 채팅",
    store_owner_payment_review_section: "결제·리뷰",
    store_owner_rider_status_line: "라이더 상태: {status}",
    store_owner_no_menu_info: "메뉴 정보가 없습니다.",
    store_owner_dash_customer_care: "고객 응대 현황",
    store_owner_dash_inventory_issues: "운영 이슈",
    store_owner_dash_order_flow: "주문 진행 현황",
    store_owner_dash_today_summary: "오늘 운영 요약",
    store_owner_dash_refresh_ops: "운영 데이터 새로고침",
    store_owner_dash_updated_at: "업데이트 {time}",
    store_owner_dash_no_urgent: "지금 처리할 긴급 주문이 없습니다.",
    store_owner_dash_urgent_title: "긴급 처리",
    store_owner_dash_new_orders: "신규 주문",
    store_owner_dash_wait_over_3m: "3분 이상 미접수 {count}건",
    store_owner_dash_waiting_accept: "접수 대기 중",
    store_owner_dash_cooking_delay: "조리 지연",
    store_owner_dash_over_eta: "예상 시간 초과",
    store_owner_dash_delivery_delay: "배달 지연",
    store_owner_dash_rider_unassigned: "라이더 미배정",
    store_owner_dash_delivery_delayed_occurred: "배달 지연 발생",
    store_owner_dash_unconfirmed_orders: "미확인 주문",
    store_owner_dash_unconfirmed_over_3m: "3분 이상 미확인",
    store_owner_dash_confirm_done: "확인 완료",
    store_owner_dash_review_orders_btn: "주문 확인하기",
    store_owner_dash_status_normal: "정상",
    store_owner_dash_offline_stale: "오프라인 — 이전 데이터를 표시 중입니다",
    store_owner_dash_offline_network: "네트워크 연결을 확인해 주세요",
    store_owner_dash_flow_waiting: "접수 대기",
    store_owner_dash_flow_cooking: "조리 중",
    store_owner_dash_flow_delivering: "배달 중",
    store_owner_dash_flow_done: "완료",
    store_owner_dash_delay_count: "지연 {count}건",
    store_owner_dash_today_order_count: "오늘 주문",
    store_owner_dash_count_orders: "{count}건",
    store_owner_dash_today_sales: "오늘 매출",
    store_owner_dash_avg_order_value: "객단가",
    store_owner_dash_cancel_rate: "취소율",
    store_owner_dash_view_detail: "상세 보기",
    store_owner_dash_view_all: "전체 보기",
    store_owner_dash_delta_vs_yesterday: "어제 대비 {sign}{delta}%",
    store_owner_dash_unanswered_chat: "미답변 채팅",
    store_owner_dash_reply_needed: "답장 필요",
    store_owner_dash_no_new_10m: "최근 10분 신규 없음",
    store_owner_dash_review_reply: "리뷰 답변",
    store_owner_dash_response_needed: "응답 필요",
    store_owner_dash_done: "완료",
    store_owner_dash_refund_requests: "환불 요청",
    store_owner_dash_action_needed: "조치 필요",
    store_owner_dash_none: "없음",
    store_owner_dash_claims: "클레임",
    store_owner_dash_no_new_claims: "신규 클레임 없음",
    store_owner_dash_chat_shortcut: "채팅 바로가기",
    store_owner_dash_sold_out: "품절",
    store_owner_dash_check_stock: "재고 확인 필요",
    store_owner_dash_hidden: "숨김 메뉴",
    store_owner_dash_check_sales_status: "판매 상태 확인",
    store_owner_dash_sale_suspended: "판매 중지",
    store_owner_dash_draft_unpublished: "임시저장·미공개",
    store_owner_dash_option_errors: "옵션 오류",
    store_owner_dash_fix_needed: "수정 필요",
    store_owner_dash_check_scheduled: "예약 판매 확인",
    store_owner_dash_count_items: "{count}개",
    store_owner_flow_aria_waiting: "접수 대기 단계",
    store_owner_flow_aria_cooking: "조리 중 단계",
    store_owner_flow_aria_delivering: "배달 중 단계",
    store_owner_flow_aria_done: "완료 단계",
    store_owner_orders_login_hint: "로그인 후 매장 주문을 확인할 수 있습니다.",
    store_owner_mobile_tab_new_orders: "신규주문",
    store_owner_mobile_tab_progress: "진행중",
    store_owner_mobile_tab_shipping: "배달중",
    store_owner_mobile_tab_done: "완료",
    store_owner_mobile_tab_cancelled: "취소",
    store_owner_pull_release_refresh: "놓으면 새로고침",
    store_owner_pull_hint: "아래로 당겨 새로고침",
    store_home_pull_hint: "땡겨서 새로고침",
    store_home_pull_release: "놓으면 새로고침",
    store_home_pull_refreshing: "새로고침 중…",
    store_owner_bottom_nav_home: "홈",
    store_owner_bottom_nav_dashboard: "대시보드",
    store_owner_bottom_nav_order_chat: "주문채팅",
    store_owner_bottom_nav_orders: "주문관리",
    store_owner_bottom_nav_menu: "메뉴관리",
    store_owner_bottom_nav_settings: "매장설정",
    store_owner_hub_avatar_fallback: "샵",
    store_owner_chat_room_open_failed: "채팅방을 열 수 없습니다.",
    store_owner_chat_room_missing: "연결된 채팅방이 없습니다.",
    store_owner_chat_network_failed: "네트워크 오류로 채팅을 열 수 없습니다.",
    store_buyer_public_label_fallback: "고객",
    store_owner_call_buyer: "구매자에게 전화",
    store_owner_cancel_not_allowed: "이 단계에서는 취소할 수 없습니다.",
    store_owner_card_chat: "채팅",
    store_owner_card_collapse: "접기",
    store_owner_card_expand: "펼치기",
    store_owner_chat_load_failed: "채팅을 불러오지 못했습니다.",
    store_owner_chat_order_context_missing: "주문 정보가 없어 채팅을 열 수 없습니다.",
    store_owner_delivery_info_section: "배달 정보",
    store_owner_est_arrival_suffix: " · 도착 약 {minutes}분",
    store_owner_est_prep_line: "조리 {prep}",
    store_owner_est_prep_unknown: "조리 시간 미정",
    store_owner_label_receipt: "영수증",
    store_owner_label_review_short: "리뷰",
    store_owner_menu_summary_extra: " 외 {count}개",
    store_owner_menu_summary_line: "{title} ×{qty}{extra}",
    store_owner_menu_summary_none: "메뉴 없음",
    store_owner_network_patch_failed: "네트워크 오류로 처리하지 못했습니다.",
    store_owner_no_address: "배달 주소 없음",
    store_owner_no_request_note: "요청사항 없음",
    store_owner_open_btn: "열기",
    store_owner_pickup_info_section: "픽업 정보",
    store_owner_pickup_order_hint: "매장 픽업 주문입니다.",
    store_owner_status_auto_log: "주문 상태가 자동으로 기록됩니다.",
    store_owner_step_tap_aria: "{label} 단계로 진행",
    store_owner_stepper_aria: "주문 진행 단계",
    store_owner_confirm_buyer_fallback: "고객",
    store_owner_confirm_accepted: "{who}님 주문을 접수할까요?",
    store_owner_confirm_preparing: "{who}님 주문을 조리 시작할까요?",
    store_owner_confirm_ready_delivery: "{who}님 주문 포장을 완료했나요?",
    store_owner_confirm_ready_pickup: "{who}님 픽업 준비가 끝났나요?",
    store_owner_confirm_delivering: "{who}님 주문을 배달 출발할까요?",
    store_owner_confirm_arrived: "{who}님 주문을 도착 처리할까요?",
    store_owner_confirm_completed_delivery: "{who}님 배달을 완료할까요?",
    store_owner_confirm_completed_pickup: "{who}님 픽업 완료로 처리할까요?",
    store_owner_confirm_status_change: "{who}님 주문 상태를 변경할까요?",
    store_owner_step_preparing_short: "조리 시작",
    store_owner_step_ready_complete: "포장 완료",
    store_owner_step_pickup_waiting: "픽업 대기",
    store_owner_step_delivery_start: "배달 출발",
    store_owner_step_arrived_short: "도착",
    store_owner_step_delivery_done: "배달 완료",
    store_owner_step_start_preparing: "조리 시작",
    store_owner_step_pickup_done: "픽업 완료",
    store_owner_ops_status_ready_delivery: "배달 준비 완료",
    store_owner_ops_status_ready_pickup: "픽업 준비 완료",
    store_owner_ops_status_completed_delivery: "배달 완료",
    store_owner_ops_status_completed_pickup: "픽업 완료",
    store_order_process_step_ready_dispatch: "배달 출발 준비",
    store_owner_ops_flow_new: "신규",
    store_owner_ops_flow_accepted: "접수",
    store_owner_ops_flow_cooking: "조리",
    store_owner_ops_flow_delivery_ready: "배달 준비",
    store_owner_ops_flow_delivering: "배달 중",
    store_owner_ops_flow_near_address: "배달지 근처",
    store_owner_ops_flow_done: "완료",
    store_owner_ops_flow_pickup_ready: "픽업 준비",
    store_owner_ops_flow_pickup_done: "픽업 완료",
    store_owner_rider_waiting: "라이더 대기",
    store_owner_rider_assigned: "라이더 배정",
    store_owner_rider_pickup_progress: "픽업 중",
    store_owner_rider_delivering: "배달 중",
    store_owner_rider_delivered: "배달 완료",
    store_owner_rider_failed: "배달 실패",
    store_owner_review_status_pending: "리뷰 대기",
    store_owner_review_status_completed: "리뷰 완료",
    store_owner_review_status_unavailable: "리뷰 불가",
    store_owner_review_status_na: "—",
    store_owner_order_review_section: "고객 리뷰",
    store_owner_order_review_pending: "고객 리뷰를 기다리는 중이에요.",
    store_owner_order_review_empty: "리뷰가 없습니다.",
    store_owner_order_review_unavailable: "리뷰 기능을 사용할 수 없어요.",
    store_owner_order_review_private_badge: "사장님만 보기",
    store_owner_order_review_rating_aria: "별점 {n}점",
    store_owner_order_review_card_badge: "리뷰",
    store_owner_order_review_card_badge_aria: "고객 리뷰 있음",
    store_owner_order_review_photo_alt: "리뷰 사진",
    store_owner_quick_reply_late: "조금 늦어요",
    store_owner_quick_reply_door: "문 앞에 두세요",
    store_owner_quick_reply_ingredients: "재료 문의",
    store_owner_quick_reply_call: "전화 주세요",
    store_owner_settlement_guide_title: "정산 안내",
    store_owner_settlement_pick_store_body: "정산 내역은 운영 중인 매장을 선택한 뒤 확인할 수 있습니다.",
    store_owner_settlement_go_hub: "내 매장으로 이동",
    store_owner_settlement_intro:
      "주문이 완료(completed)되면 정산 예정 건이 생성됩니다. 실제 입금·보류 해제는 플랫폼 운영에서 처리하며, 이 화면에서는 조회만 가능합니다.",
    store_owner_settlement_delay_days: "완료 후 약 {days}일 뒤 지급 예정일이 잡힙니다.",
    store_owner_settlement_fee_percent: "현재 적용 수수료 {percent}%",
    store_owner_settlement_fee_rate: "앞으로 적용될 수수료 {rate}",
    store_owner_settlement_fee_current_hint:
      "위 요율은 현재 정책입니다. 이미 완료된 주문 정산 행의 수수료는 완료 시점 스냅샷을 따릅니다.",
    store_owner_settlement_fee_source: "정책 출처: {source}",
    store_owner_settlement_fee_source_store: "매장 개별 정책",
    store_owner_settlement_fee_source_topic: "2차 업종 정책",
    store_owner_settlement_fee_source_category: "1차 업종 정책",
    store_owner_settlement_fee_source_default: "플랫폼 기본 정책",
    store_owner_settlement_fee_source_commerce_settings: "커머스 설정(레거시)",
    store_owner_settlement_rate_line:
      "적용 요율 {rate} · 기준 {base} · 플랫폼 인식 {revenue} · 환입 {reversal}",
    store_owner_settlement_order_status_line: "주문상태 {status} · 결제액 {paid}",
    store_owner_settlement_filter_from: "시작일",
    store_owner_settlement_filter_to: "종료일",
    store_owner_settlement_filter_order_no: "주문번호",
    store_owner_settlement_period_hint:
      "기간은 정산 원장 생성일(완료 인식) 기준입니다. 표시 수수료율은 현재 정책이며, 주문별 수수료는 스냅샷을 따릅니다.",
    store_owner_settlement_refreshing: "새로고침 중…",
    store_owner_settlement_manage_orders: "주문 관리",
    store_owner_settlement_loading: "불러오는 중…",
    store_owner_settlement_empty: "아직 정산 내역이 없습니다. 완료된 주문이 생기면 여기에 표시됩니다.",
    store_owner_settlement_list_title: "정산 내역",
    store_owner_settlement_summary_title: "정산 요약",
    store_owner_settlement_filter_title: "상태별 보기",
    store_owner_settlement_summary_basis:
      "예정금은 scheduled·processing·held, 완료금은 paid 상태만 합산합니다.",
    store_owner_settlement_summary_count: "{label} {count}건 기준",
    store_owner_settlement_summary_gross: "총 매출",
    store_owner_settlement_summary_platform_fee: "플랫폼·고정 수수료",
    store_owner_settlement_summary_delivery: "배달비 차감",
    store_owner_settlement_summary_refund: "환불 차감",
    store_owner_settlement_summary_pending: "정산 예정금",
    store_owner_settlement_summary_paid: "정산 완료금",
    store_owner_settlement_row_order: "주문 {no}",
    store_owner_settlement_due_date: "정산 예정일 {date}",
    store_owner_settlement_paid_at: "지급 {date}",
    store_owner_settlement_amount_line: "매출 {gross} · 수수료 {fee} · 환불 {refund}",
    store_owner_settlement_fee_line: "플랫폼 {platform} · 고정 {fixed} · 배달 차감 {delivery}",
    store_owner_settlement_hold: "보류: {reason}",
    store_owner_settlement_payout: "입금 확인 {date}",
    store_owner_settlement_view_order: "해당 주문 보기",
    store_owner_settlement_err_table_missing: "정산 테이블이 아직 적용되지 않았습니다.",
    store_owner_settlement_status_scheduled: "지급 예정",
    store_owner_settlement_status_processing: "처리 중",
    store_owner_settlement_status_paid: "지급 완료",
    store_owner_settlement_status_held: "보류",
    store_owner_settlement_status_cancelled: "취소",
    store_owner_settlement_filter_empty: "선택한 상태의 정산 건이 없습니다.",

  },

  en: {

    store_sub_industry_aria: "Subcategory",

    store_invalid_industry: "This category does not exist.",

    store_verifying_live_link: "Checking live store link…",

    store_empty_store_list: "No stores to show.",

    store_browse_other_industries: "Browse other categories",

    store_industry_grid_title: "Browse by category",

    store_checkout_confirm_title: "Please confirm your order",

    store_checkout_confirm_order_summary: "Order items",

    store_label_contact: "Contact",

    store_label_address: "Address",

    store_label_payment: "Payment",

    store_checkout_submitting: "Submitting…",

    store_checkout_submit: "Place order",

    store_order_thanks: "Thank you",

    store_order_number: "Order no.",

    store_order_vendor: "Store",

    store_order_amount: "Order total",

    store_order_load_failed: "Could not load the order or the order number is missing.",

    store_back_to_store_aria: "Back to store",

    store_order_not_found: "Order not found or invalid order number.",
    store_order_status_line: "Status: {status} · {fulfillment}",

    store_menu_search_placeholder: "Search menu items",

    store_popular_menu_aria: "Popular menu",

    store_sold_out: "Sold out",

    store_favorite_login_required: "Sign in to save favorites.",

    store_primary_industry_aria: "Main category",

    store_browse_primary_menu_all: "All categories",

    store_subtopic_suffix: " · Subtopics",

    store_collect_view: "View all",

    store_browse_view_all: "View all",

    store_browse_food_all: "All",

    store_feed_stores_title: "Stores",

    store_more_food_link: "More food",

    store_by_industry_link: "By category",

    store_register_store: "Register store",

    store_add_store: "Add store",

    store_region_settings_btn: "Neighborhood",

    store_browse_by_industry_find: "Browse by category",

    store_browse_primary_fallback: "Store",

    store_supabase_unconfigured_hint:
      "Supabase is not connected or store tables are not set up yet.",

    store_browse_primary_restaurant: "Restaurant",

    store_browse_primary_mart: "Mart",

    store_browse_primary_hardware: "Hardware",

    store_browse_primary_pet: "Pet shop",

    store_browse_primary_cafe: "Cafe",

    store_browse_primary_beauty: "Beauty",

    store_browse_primary_academy: "Academy",

    store_browse_primary_life: "Services",

    store_browse_primary_lifestyle: "Lifestyle",

    store_browse_primary_restaurant_desc: "Restaurants and food delivery",

    store_browse_primary_mart_desc: "Mart and groceries",

    store_browse_primary_lifestyle_desc: "Lifestyle and local services",

    store_browse_food_korean: "Korean",

    store_browse_food_chicken: "Chicken",

    store_browse_food_noodles: "Noodles",

    store_browse_food_chinese: "Chinese",

    store_browse_food_japanese: "Japanese",

    store_browse_food_pizza: "Pizza",

    store_browse_food_snack: "Snacks",

    store_browse_food_lunchbox: "Lunch",

    store_browse_food_local: "Local",

    store_browse_food_dessert: "Dessert",

    store_browse_food_late_night: "Late night",

    store_browse_food_western: "Western",

    store_stores_home: "Store home",

    store_browse_loading_list: "Loading store list…",

    store_browse_list_preparing:
      "Store listings for this category are being prepared. Please check back soon.",

    store_browse_list_live: "Live stores. Sorted by your neighborhood and location settings.",

    store_browse_list_empty:
      "No stores in this category and subtopic. Check category, approval, and visibility.",

    store_browse_list_fetch_failed: "Could not load the list. Please try again shortly.",

    store_browse_home_link: "Back to store home",

    store_browse_empty_preparing:
      "Store listings are being prepared. Try again later or browse another category first.",

    store_browse_empty_hint:
      "Try another subtopic, or check the store’s category, subtopic, approval, and visibility.",

    store_browse_scope_disabled_hint: "This category scope is currently disabled by operations.",

    store_browse_industry_map_link: "Category map on store home",

    store_order_dash_chip_receiving: "Received",

    store_order_dash_chip_preparing: "Preparing",

    store_order_dash_chip_delivering: "Delivery",

    store_order_dash_loading_hint: "Loading order summary. Shortcuts are available now.",

    store_order_dash_guest_hint: "Sign in to open orders and chats quickly.",

    store_order_dash_login: "Sign in",

    store_order_dash_hub: "Order hub",

    store_order_dash_all_count: "All {count}",

    store_order_dash_open: "Open",

    store_row_menu_view_aria: "View menu · {store} · {item}",

    store_row_store_more_aria: "More from {store}",

    store_featured_menu_image_aria: "Featured menu image",

    store_show_more: "More",

    store_straight_distance_title: "Straight-line distance",
    store_delivery_distance_out_of_range: "Out of range",
    store_delivery_distance_out_of_range_with_max: "Over {km}km",

    store_hub_my_zone_title: "My orders · Store ops",
    store_hub_ops_center: "Owner center",
    store_hub_ops_basic_info: "Basic info",
    store_hub_ops_review_status: "Review & ops status",
    store_hub_ops_review_exposure: "Visibility review:",
    store_hub_ops_approved_hidden: "Approved but hidden",
    store_hub_ops_check_in_center: "Check in owner center",
    store_hub_ops_all_menu: "All menu",
    store_hub_ops_my_store: "View my store",
    store_lite_inquiry_check: "Check inquiries",
    store_lite_order_manage: "Manage orders",
    store_lite_delivery_chat: "Delivery chat",
    store_lite_store_settings: "Store settings",
    store_lite_received_inquiries: "Received inquiries",

    store_search_placeholder: "Search stores",

    store_my_store_status_loading: "Checking my store status…",

    store_my_store_label: "My store",

    store_listed_on_stores: "Listed on /stores",

    store_other_owned_stores: "{count} more owned stores — switch in the owner center.",

    store_feed_eyebrow: "Feed",
    store_curation_eyebrow: "Curated",

    store_no_registered_stores: "No stores registered",

    store_spot_recommended_title: "Editor's picks",

    store_spot_recommended_subtitle: "Neighborhood stores chosen by editors — swipe the cards.",

    store_recommended_stores_aria: "Recommended stores",

    store_live_eyebrow: "Live",

    store_order_now_title: "Order now",

    store_home_popular_stores_title: "Most ordered restaurants",

    store_home_new_stores_title: "Newly opened",

    store_home_campaigns_title: "Ongoing events",

    store_order_now_subtitle: "Open · delivery or pickup available",

    store_neighborhood_more_title: "More in this area",

    store_neighborhood_more_subtitle: "Mixed by distance and popularity",

    store_my_orders_title: "My orders",

    store_order_shortcuts_aria: "Order shortcuts",

    store_in_progress: "In progress",

    store_history: "History",

    store_order_chat: "Order chat",

    store_recent: "Recent",

    store_detail_link: "Details",

    store_no_orders: "No orders",

    store_find_industry: "Find category",

    store_status_label: "Status",

    store_order_status_filter_aria: "Order status filter",

    store_ops_title: "Store operations",

    store_owner_shortcut_title: "Owner shortcuts",

    store_ops_menu_aria: "Store operations menu",

    store_promo_eyebrow: "At a glance",

    store_promo_title: "Pick a category and go",

    store_promo_subtitle: "Restaurant, mart, lifestyle — switch tabs to change subcategories.",

    store_open_industries: "Open categories",

    store_reviews_count: "Reviews {count}",

    store_est_prep: "Est. {label}",

    store_delivery_fee_per_store: "Delivery fee varies by store",

    store_modifier_required: "Required",

    store_modifier_optional: "Optional {hint}",
    store_approval_status_approved: "Approved",
    store_approval_status_pending: "Pending",
    store_approval_status_rejected: "Rejected",
    store_approval_status_revision_requested: "Revision requested",
    store_approval_status_suspended: "Suspended",
    store_approval_status_under_review: "Under review",
    store_approval_status_unknown: "Status unknown",
    store_avg_rating_label: "Average ★ {rating}",
    store_badge_coupon: "Coupon",
    store_insertion_sponsored: "Sponsored",
    store_insertion_home_ads_title: "Sponsored stores",
    store_insertion_home_coupons_title: "Discount coupons",
    store_insertion_coupon_discount: "{discount} off",
    store_insertion_coupon_min_order: "Min. order {amount}",
    store_checkout_coupon_applied: "Coupon discount applied",
    store_err_coupon_not_found: "Coupon not found.",
    store_err_coupon_inactive: "This coupon is not available.",
    store_err_coupon_expired: "This coupon has expired.",
    store_err_coupon_wrong_store: "This coupon cannot be used at this store.",
    store_err_coupon_min_order: "Minimum order amount not met.",
    store_err_coupon_already_redeemed: "You have already used this coupon.",
    store_err_coupon_invalid: "Coupon discount could not be applied.",
    store_banner_slide_aria: "Banner {index}",
    store_cart_added_short_toast: "Added to cart",
    store_cart_aria: "Cart",
    store_cart_aria_with_kinds: "Cart · {count} items",
    store_cart_entry_sub_api: "Could not load right now. Try again shortly.",
    store_cart_entry_sub_gone: "No cart found at this address.",
    store_cart_entry_sub_network: "Check your connection and try again.",
    store_cart_entry_title_network: "Could not load cart",
    store_cart_entry_title_not_found: "Cart not found",
    store_cart_option_updated_toast: "Options updated",
    store_chat_inquiry_menu: "Chat inquiry",
    store_checkout_phone_profile_hint_account_link: "My page · Account",
    store_checkout_phone_profile_hint_prefix: "Your phone number is saved in",
    store_checkout_phone_profile_hint_suffix: ".",
    store_commerce_summary_disclaimer: "Amounts and times are store estimates and may differ.",
    store_confirm_at_order: "Confirm at checkout",
    store_content_empty: "No content",
    store_copy_address_btn: "Copy address",
    store_delivery_eta_detail: "Delivery ETA varies by store, distance, and order volume.",
    store_delivery_eta_label: "Delivery ETA",
    store_delivery_hours_label: "Delivery hours",
    store_detail_info_address_hint_after: " for address, contact, and map.",
    store_detail_info_address_hint_before: "See the ",
    store_detail_info_tab_short: "Store info",
    store_err_delivery_region_city_google_hint: "Select a delivery address saved via Google search.",
    store_err_delivery_region_unverified: "Could not verify delivery region. Select the address again.",
    store_err_order_redirect_failed: "Could not open the order page.",
    store_err_own_store_block: "You cannot order from your own store.",
    store_err_sold_out_cannot_add: "Sold-out items cannot be added.",
    store_free_delivery_threshold_line: "Free delivery over {amount}",
    store_fulfillment_delivery_short: "Delivery",
    store_fulfillment_pickup_short: "Pickup",
    store_location_map_title: "{store} location",
    store_location_region_barangay: "Region · barangay",
    store_location_section_default: "Location",
    store_meta_cart_title: "Cart",
    store_meta_checkout_title: "Checkout",
    store_meta_product_desc: "Product from {store}.",
    store_meta_product_title: "Product",
    store_meta_report_desc: "Submit a report about a store or product.",
    store_meta_report_title: "Report store or item",
    store_meta_reviews_title: "Reviews",
    store_meta_store_info_title: "Store info",
    store_messenger_order_chat_label: "Order chat",
    store_min_order_none: "No minimum order",
    store_modifier_count_max: "Up to {max}",
    store_modifier_count_max_select: "Select up to {max}",
    store_modifier_count_min: "Select {min}",
    store_modifier_count_min_select: "Select at least {min}",
    store_modifier_count_range: "{min}–{max}",
    store_modifier_count_range_select: "Select {min}–{max}",
    store_modifier_count_upto: "Up to {max}",
    store_modifier_optional_chip: "Optional",
    store_my_delivery_orders: "My delivery & pickup orders",
    store_notice_check_fallback: "Check store notices",
    store_notice_store_suffix: "{store} notice",
    store_options_load_failed: "Could not load options",
    store_options_loading: "Loading options…",
    store_order_check_my_delivery_hint: "Check in-progress orders in My orders.",
    store_order_completed: "Order completed",
    store_payment_check_at_store: "Ask at store",
    store_payment_contact_store: "Contact store",
    store_phone_menu_call: "Call",
    store_phone_menu_none: "No phone number",
    store_pickup_no_short: "No pickup",
    store_pickup_yes_short: "Pickup",
    store_prep_row_prefix: "Prep ",
    store_product_load_failed_short: "Could not load product",
    store_product_sheet_title: "Item details",
    store_public_address_detail_label: "Address detail",
    store_public_address_street_label: "Street address",
    store_report_err_duplicate: "You recently submitted a similar report.",
    store_report_err_empty: "Enter details.",
    store_report_err_failed: "Could not submit report.",
    store_report_reason_fraud: "Fraud",
    store_report_reason_harassment: "Harassment",
    store_report_reason_illegal: "Illegal or dangerous",
    store_report_reason_misleading: "Misleading info",
    store_report_reason_other: "Other",
    store_report_reason_spam: "Spam",
    store_report_submit_btn: "Submit report",
    store_report_submitting: "Submitting…",
    store_report_target_product: "Reporting this product.",
    store_report_target_store: "Reporting this store.",
    store_store_guide_collapsed_hint: "· Hours, delivery & payment",
    store_store_guide_heading: "Store guide",
    store_store_info_menu: "Store info",
    store_stores_page_meta_description: "Find neighborhood stores by area, search, and category — order food and products.",
    store_wrong_store_product: "This item is not from this store",

    store_sold_out_cannot_select: "Sold out · cannot select",

    store_sheet_close_aria: "Close sheet",

    store_review_summary_load_failed: "Could not load review summary.",

    store_reviews_title: "Reviews",

    store_qty_decrease_aria: "Decrease quantity",

    store_qty_increase_aria: "Increase quantity",

    store_cart_preview_empty: "No items in cart",

    store_cart_total: "Total",

    store_free_delivery_applied: "Free delivery applied",

    store_reviews_view_all_aria: "View all reviews",

    store_order_count_badge: "Orders {count}",

    store_open_now: "Open",

    store_preparing: "Preparing",
    store_closed_now: "Closed",
    store_resting_now: "On break",
    store_delivery_available: "Delivery",
    store_pickup_available: "Pickup",
    store_visit_available: "Dine-in",

    store_badge_delivery: "Delivery",

    store_badge_instant_discount: "Instant discount",

    store_badge_reservation: "Reservation",
    store_badge_recommended: "Recommended",
    store_badge_new_store: "New",

    store_directions_google_aria: "Directions from my location on Google Maps",

    store_menu_search_aria: "Search menu",

    store_more_aria: "More",

    store_fulfillment_mode_aria: "Fulfillment method",

    store_cart_saved_hint: "If you have a saved cart, open it below.",

    store_current_cart: "Current cart",

    store_min_order: "Minimum order",

    store_current_items_total: "Items subtotal",

    store_shortfall_amount: "Amount short",

    store_add_friend_aria: "Add friend",

    store_order_accepted: "Your order was received.",

    store_cart_empty: "Your cart is empty",

    store_cart_empty_hint: "Find a store you'd like to order from",

    store_qty_decrease_alt_aria: "Decrease quantity",

    store_qty_increase_alt_aria: "Increase quantity",

    store_items_subtotal: "Items subtotal",

    store_estimated_delivery_fee: "Est. delivery fee",

    store_payment_due: "Amount due",

    store_free_delivery_progress_aria: "Progress toward free delivery",

    store_fulfillment_mode: "Fulfillment",

    store_payment_method_aria: "Payment method",

    store_pickup_location: "Pickup location (store address)",

    store_optional_suffix: " (optional)",

    store_delivery_address_loading: "Loading delivery address…",

    store_delivery_address_1_aria: "Select delivery address 1 (My page)",

    store_delivery_address_1: "Delivery address 1",

    store_prep_time_store_basis: "Based on store prep guidance",

    store_route_motorcycle_basis: "Based on motorcycle route",

    store_order_detail_title: "Order details",

    store_progress_status: "Progress",

    store_store_inquiry_chat: "Store inquiry chat",

    store_order_info: "Order info",

    store_request_label: "Request",

    store_menu_section: "Menu",

    store_product_label: "Items",

    store_delivery_fee: "Delivery fee",

    store_total: "Total",

    store_order_timeline_aria: "Order progress steps",

    store_order_timeline_buyer_desc:
      "Four steps from order placed to delivery (or pickup) complete. Updates when the store changes status and posts to chat.",

    store_order_chat_buyer_hint:
      "Check order status in Progress above. Use chat only when you need to request something or coordinate.",

    store_open_store_inquiry: "Open store inquiry",

    store_open_order_progress_chat: "Open order progress chat",

    store_manage_in_my_orders: "Manage in My Orders",

    store_order_wrong_store: "This order does not belong to this store.",

    store_back_to_store_short: "← Store",

    store_cart_address_row_loading: "Loading address…",

    store_cart_menu_options_total: "Menu & options total",

    store_product_sheet_add_aria:
      "{label}, cart {count}, menu & options total {amount}",

    store_product_sheet_add_aria_no_cart: "{label}, menu & options total {amount}",

    store_cod_with_partner: "COD · {label}",

    store_min_order_short: "Min. order",

    store_est_prep_short: "Est. prep",

    store_region_label: "Area",

    store_go_checkout_aria: "Go to checkout",

    store_cart_preview_aria: "Cart preview",

    store_bottom_status_break: "Preparing · {detail}",
    store_bottom_status_closed: "Not taking orders right now",
    store_bottom_status_delivery_open: "Delivery orders are open",
    store_bottom_status_pickup_open: "Pickup orders are open",
    store_bottom_fulfillment_delivery: "Delivery",
    store_bottom_fulfillment_pickup: "Pickup",
    store_bottom_cart_line_count: "{count} items",
    store_bottom_checkout_btn: "Review order",
    store_bottom_min_order_remaining: "{amount} more for minimum order",

    store_delivery_order_summary_aria: "Delivery and order summary",

    store_delivery_guide: "Delivery info",

    store_delivery_order_guide_title: "Delivery and ordering",

    store_inquiry_title: "Contact",

    store_phone_inquiry: "Call store",

    store_info_aria: "Store information",

    store_info_title: "Store information",

    store_rating_label: "Rating",

    store_favorites_label: "Favorites",

    store_recent_orders: "Recent orders",

    store_available: "Available",

    store_info_card_sub: "Address · hours · info",

    store_shop_info_title: "Store info",

    store_hours_weekday: "Hours",

    store_hours_saturday: "Saturday hours",

    store_hours_sunday: "Sunday hours",

    store_closed_days: "Closed",

    store_phone_number: "Phone",

    store_location: "Location",

    store_neighborhood: "Neighborhood",

    store_delivery_pickup: "Delivery · pickup",

    store_delivery_time: "Delivery time",

    store_delivery_fee_notice: "Delivery fee (info)",

    store_delivery_region_guide: "Delivery and area info",

    store_registered_updated: "Registered · updated",

    store_intro_benefits_title: "About and perks",

    store_no_intro: "No description yet.",

    store_stats_title: "Store stats",

    store_order_count_label: "Orders",

    store_recent_90_days: "(last 90 days)",

    store_review_count_label: "Reviews",

    store_flyer_intro_title: "Flyer · intro",

    store_link_copied: "Link copied.",

    store_order_summary_aria: "Order summary",

    store_commerce_summary_aria: "Min order, delivery, prep, payment summary",

    store_commerce_notice_prefix: "Hours, payment, and notices registered by the store. Address and map are under ",
    store_commerce_notice_suffix: ", or from the ⋯ menu at the top.",

    store_courier_cod: "Courier (COD)",

    store_navigating: "Redirecting…",

    store_cart_empty_period: "Your cart is empty.",

    store_cart_empty_add_menu: "Add menu items from the store page.",

    store_owner_pick_aria: "Owner's picks",

    store_owner_pick_title: "Owner's picks",

    store_menu_category_aria: "Menu categories",

    store_menu_label: "Menu",

    store_add_options: "Add options",

    store_per_item: "Per item",

    store_menu_amount: "Menu amount",

    store_per_unit_suffix: "/ea",

    store_quantity: "Quantity",

    store_order_total: "Order total",

    store_request_note: "Special requests",

    store_request_placeholder: "e.g. less spicy, no onions",

    store_fix_modifier_selection: "Please select valid options.",

    store_selected_options: "Selected options",

    store_required_options_hint: "Please check required options.",

    store_request_placeholder_alt: "e.g. extra broth",

    store_order_contact_aria: "Order contact",

    store_pickup_time_placeholder: "Pickup time, etc.",

    store_product_amount: "Items subtotal",

    store_planned_order_total: "Estimated total",

    store_notice_label: "Notice",

    store_report_submitted: "Report submitted.",

    store_report_followup:

      "We will review and act if needed. False reports may be penalized.",

    store_report_reason: "Reason",

    store_report_detail_label: "Details (max 2000 characters)",

    store_report_detail_placeholder: "More detail helps our review.",

    store_invalid_address: "Invalid address.",

    store_reviews_loading: "Loading reviews…",

    store_no_reviews_yet: "No reviews yet.",

    store_sort_recommended: "Recommended",

    store_sort_latest: "Newest",

    store_sort_rating_high: "Highest rating",

    store_sort_rating_low: "Lowest rating",

    store_owner_reply_count: "Owner replies {count}",

    store_no_matching_reviews: "No reviews match your filters.",

    store_owner_reply: "Owner reply",

    store_order_type_delivery: "Delivery",

    store_order_type_pickup: "Pickup",

    store_review_report_btn: "Report",

    store_review_report_aria: "Report this review",

    store_review_report_prompt: "Please enter the reason for the report",

    store_review_report_submitted: "Your report has been submitted.",

    store_review_menu_good: "Delicious",

    store_review_menu_bad: "Could be better",

    store_cart_preview_none: "No items",

    store_cart_items_kind: "· {count} items",

    store_cart_clearing: "Clearing…",

    store_this_store: "This store",

    store_other_store: "Another store",

    store_added_to_cart_toast: "Added {title}",

    store_menu_review_link: "Menu reviews ({count}) ›",

    store_product_price_label: "Price",

    store_product_price_before_options: "Menu price before add-ons.",

    store_product_qty_label: "Quantity",

    store_product_qty_count: "{count}",

    store_product_option_load_failed: "Could not load options.",

    store_product_photo_disclaimer: "Photos may be styled and differ from the actual dish.",

    store_product_photos_aria: "Photos of {title}",

    store_product_delivery_min_order_heading: "Delivery minimum order",

    store_product_cart_subtotal_line: "Cart subtotal {amount}",

    store_product_line_amount_heading: "Selected amount",

    store_add_to_cart_with_amount: "Add {amount}",

    store_add_to_cart_amount_aria: "Add {amount} to cart",

    store_cart_conflict_processing: "Processing…",

    store_cart_clear_title: "Clear cart?",

    store_cart_clear_body: "All items will be removed.",

    store_cart_clear_confirm: "Clear",

    store_cart_other_title: "Another store is in your cart",

    store_cart_single_store_rule: "You can only order from one store per cart.",

    store_cart_current_label: "Current cart",

    store_cart_pending_label: "Adding",

    store_cart_list_total: "Total",

    store_cart_view: "View cart",

    store_cart_replace_confirm: "Clear cart and add",

    store_cart_expired_toast: "Your old cart expired and was cleared.",

    store_cart_summary_hint: "You can only checkout items from this store together.",

    store_cart_page_title: "Cart",

    store_cart_fulfillment_select_hint: "Please choose how you'd like to receive your order",

    store_cart_add_menu: "Add items",

    store_cart_upsell_title: "Goes well with your order",

    store_cart_line_request: "Request: {note}",

    store_manage_my_shop: "Manage my store",

    store_favorite_remove_aria: "Remove favorite",

    store_favorite_add_aria: "Add favorite",

    store_delivery_order_mode: "Delivery order",

    store_pickup_order_mode: "Pickup order",

    store_delivery_tab: "Delivery",

    store_pickup_tab: "Pickup",

    store_prep_time_label: "Prep time",

    store_route_distance: "Route distance",

    store_payment_methods_label: "Payment",

    store_pickup_time_label: "Pickup time",

    store_location_guide: "Location",

    store_directions_btn: "Directions",

    store_none: "None",

    store_min_amount_or_more: "{amount} or more",

    store_about_minutes: "About {minutes} min",

    store_about_time: "About {time}",

    store_cod_not_in_app: "Not included in app payment (COD)",

    store_app_delivery_zero: "App delivery fee ₱0",

    store_free_delivery_over: "Free delivery over {amount}",

    store_fulfillment_mode_label: "Fulfillment",

    store_optional_paren: "(optional)",

    store_contact_optional: "Contact",

    store_request_optional_label: "Requests (optional)",

    store_product_request_optional: "Item note (optional · not included in price)",

    store_report_product: "Report item",

    store_add_to_cart: "Add to cart",

    store_view_order_history: "View order history",

    store_view_order_progress: "View this order",

    store_leave_store_inquiry: "Message store",

    store_order_flow_hint:
      "Order status continues on the order details page. Use delivery chat only when you need to coordinate with the store. Settle payment directly with the store.",

    store_reviews_total: "Total reviews {count}",

    store_review_preview_empty: "No reviews yet.",

    store_photo_reviews: "Photo reviews",

    store_photo_reviews_only: "Photos only",

    store_photo_reviews_more_line1: "Photo",

    store_photo_reviews_more_line2: "reviews",

    store_photo_reviews_more_aria: "See more photo reviews",

    store_review_menu_entry_aria: "Reviews for {name}",

    store_reviews_filter_all: "All",

    store_reviews_with_count: "Reviews {count}",

    store_star_points: "{star} stars",

    store_member_fallback: "SAMarket member",

    store_network_order_retry: "Connect to the network and try ordering again.",

    store_min_order_amount:
      "This store's minimum order is {amount}. Increase quantity or adjust your cart total.",

    store_err_out_of_stock: "Not enough stock. Reduce quantity or refresh and try again.",
    store_err_out_of_stock_checkout: "Some cart items are out of stock. Reduce quantity or update your cart.",

    store_err_not_accepting: "This store is not accepting orders right now.",

    store_err_preparing: "The store is preparing and cannot take orders now.",

    store_err_below_minimum: "Below the minimum order amount. Increase the total and try again.",
    store_err_below_minimum_cart: "Below the minimum order. Add more items to your cart.",

    store_err_own_store: "You cannot order from your own store.",

    store_err_required_options: "Please select all required options.",

    store_err_too_many_options: "Too many options selected.",

    store_err_invalid_option: "Includes options that cannot be selected.",

    store_err_option_mismatch: "Option data mismatch. Refresh and try again.",

    store_err_no_options: "This item does not support options. Refresh and try again.",

    store_err_duplicate_option: "Duplicate option selected.",

    store_err_duplicate_line: "Duplicate line items in the order.",

    store_err_order_failed: "Order failed. ({code})",

    store_err_cart_add_failed: "Could not add to cart.",

    store_options_add_amount: "Options +{amount}",

    store_stock_qty: "Stock {count}",

    store_stock_untracked: "Stock not tracked · no quantity limit",

    store_discount_applied: "{pct}% off",

    store_stock_below_min: "Stock is below the minimum order quantity ({min}).",

    store_qty_min_max: "Min {min} · max {max}",

    store_qty_min_max_stock: "Min {min} · max {max} (stock {stock})",

    store_cod_label: "COD",

    store_free_delivery_threshold_met: "Free delivery applied (orders {amount}+)",

    store_min_order_shortfall:
      "Orders start at {min}. ({short} short) · add more items or increase quantity.",

    store_order_info_loading: "Loading order info…",
    store_order_info_unavailable: "Could not load order info.",
    store_status_banner_dismiss_aria: "Dismiss status banner",
    store_delivery_address_heading: "Delivery address",
    store_address_detail_line: "Detail: {detail}",
    store_delivery_fee_line: "Delivery fee: {amount}",
    store_order_payment_total_line: "Order total: {amount}",
    store_order_history_drawer_title: "Order summary",
    store_order_history_panel_open_aria: "Open order summary panel",
    store_order_history_panel_close_aria: "Close order summary panel",
    store_order_view_detail_btn: "Order details",
    store_order_cancel_btn: "Cancel order",
    store_order_drawer_menu_aria: "Menu",
    store_chat_notify_on_aria: "Chat sound on — tap to mute",
    store_chat_notify_off_aria: "Chat sound off — tap to unmute",
    store_order_id_required: "Order ID is missing.",
    store_order_chat_open_failed_error: "Could not open order chat. ({error})",
    store_orders_list_link: "Order list",
    store_server_config_required: "Server configuration is required.",
    store_pickup_address_heading: "Pickup (store address)",
    store_db_not_configured:
      "Supabase is not connected or store tables are missing. Apply SQL migrations.",
    store_not_found_short: "Store not found.",
    store_back_to_store_list: "Back to store list",
    store_menu_blocked_break:
      "Preparing · Break time: {range}. Menu selection is unavailable during break.",
    store_menu_blocked_hours:
      "Outside business hours — you can browse the menu but cannot select items.",
    store_menu_uncategorized: "Other menu",
    store_item_type_menu: "Menu",
    store_item_type_service: "Service",
    store_item_type_product: "Product",
    store_recommended_menu_title: "Recommended",
    store_popular_menu_title: "Popular menu",
    store_badge_menu_popular: "Popular",
    store_badge_owner_recommended: "Owner's pick",
    store_badge_menu_representative: "Featured",
    store_badge_menu_discount: "Sale",
    store_home_delivery_fee_discount_title: "Delivery fee discount",
    store_home_delivery_fee_discount_subtitle: "Stores with delivery fee discount evidence",
    store_menu_sales_paused:
      "This store is not approved for sales yet or sales are temporarily paused.",
    store_menu_search_no_results: "No search results.",
    store_menu_no_items_registered: "No items listed yet.",
    store_menu_select_blocked_default:
      "You cannot select menu items right now. You can still browse the list.",
    store_add_to_cart_aria: "Add {title} to cart",
    store_menu_options_badge: "Options",
    store_browse_meta_default: "Browse stores",
    store_browse_meta_title_suffix: "{label} stores",
    store_browse_meta_desc_sub: "Find {sub} {primary} stores near you.",
    store_browse_meta_desc_primary: "Find {primary} stores near you.",
    store_report_store: "Report store",
    store_fallback_name: "Store",
    store_hub_owner_ops: "Manage",
    store_hub_owner_ops_tasks_aria: "{count} store ops tasks",
    store_hub_owner_ops_shortcut_aria: "Go to store operations",
    store_delivery_float_menu_aria: "Delivery quick menu",
    store_delivery_fab_open_aria: "Expand FAB menu",
    store_delivery_fab_close_aria: "Collapse FAB menu",
    store_delivery_fab_store: "Store",
    store_delivery_fab_cart: "Cart",
    store_delivery_fab_home: "Delivery home",
    store_delivery_float_order_history: "Order history",
    store_delivery_float_order_chat: "Order chat",
    store_delivery_float_register_store: "Register my store",
    store_delivery_float_ops_center: "Operations hub",
    store_delivery_dial_cart: "Cart",
    store_delivery_dial_hub_aria: "{label} quick menu hub",
    store_back_to_menu: "Back to menu",
    store_clear_cart_btn: "Clear cart",
    store_order_accepting: "Orders open",
    store_preparing_short: "Preparing",
    store_delivery_no_short: "No delivery",
    store_delivery_yes_short: "Delivery",
    store_delivery_fee_cod_line: "COD delivery fee",
    store_delivery_fee_free_line: "Free delivery fee",
    store_free_delivery_short: "Free delivery",
    store_delivery_fee_inquire_line: "Ask about delivery fee",
    store_delivery_fee_amount_line: "Delivery fee {amount}",
    store_delivery_fee_courier_colon: "Delivery fee: {label}",
    store_eta_about_label: "~{label}",
    store_eta_about_minutes: "~{minutes} min",
    store_eta_prep_about: "Prep ~{prep}",
    store_eta_delivery_about_minutes: "Delivery ~{minutes} min",
    store_eta_prep_delivery_about_minutes: "{prep} · delivery ~{minutes} min",
    store_eta_prep_delivery_manual: "{prep} · delivery {manual}",
    store_eta_delivery_manual: "Delivery {manual}",
    store_eta_prep_delivery_dash: "{prep} · delivery —",
    store_eta_delivery_dash: "Delivery —",
    store_prep_minutes_unit: "{minutes} min",
    store_return_to_store: "Back to store",
    store_browse_stores: "Browse stores",
    store_more_menu_at_store: "More from this store",
    store_change_options: "Change options",
    store_cart_other_buckets_hint:
      "You have carts at other stores. Open each store page to view its cart.",
    store_discount_amount: "Discount",
    store_min_order_amount_colon: "Minimum order: {amount}",
    store_free_delivery_met: "Free delivery threshold met.",
    store_free_delivery_remaining: "Add {amount} more for possible free delivery.",
    store_delivery_fee_estimate_hint:
      "Selecting delivery adds the store's estimated delivery fee to the summary above.",
    store_min_order_met: "Minimum order amount met.",
    store_min_order_add_more: "Add {amount} more to meet the minimum order.",
    store_fulfillment_mode_unavailable:
      "Pickup and delivery are unavailable for this store or cart. Check store settings or adjust items.",
    store_fulfillment_all_items_blocked:
      "Items in your cart are marked unavailable for pickup and delivery. Remove them and try again.",
    store_payment_method_required: "Payment method",
    store_pickup_address_at_store_hint:
      "Pickup is at this address. If you choose delivery, the address below is used.",
    store_pickup_address_missing:
      "Store address is empty. The owner must add basic store info in the admin menu.",
    store_label_store_info: "Store info",
    store_label_delivery_address: "Delivery address",
    store_cart_login_for_saved_address:
      "Sign in to select saved delivery addresses from My page.",
    store_cart_legacy_address_notice: "{count} legacy cart-only addresses were not saved.",
    store_address_manage_link: "Address manager",
    store_cart_legacy_address_suffix: " Save a Google search address there, then select it again.",
    store_cart_profile_default_delivery: "My page · default delivery",
    store_cart_no_saved_delivery_address:
      "No saved delivery address. Add one in your profile or address manager.",
    store_cart_address_check_before_order:
      "Before ordering, ensure region and address line are at least 3 characters.",
    store_cart_saved_address_aria: "{label}, select saved address {index}",
    store_cart_profile_address_manage: "My page · addresses",
    store_cart_save_from_address_manage: "Save in address manager",
    store_cart_pick_or_register_delivery: "Select or register a delivery address.",
    store_cart_verify_delivery_address:
      "Check the selected address. Region, neighborhood, or {streetLabel} is required.",
    store_cart_address_too_short:
      "My page address is empty or too short. Finish your profile or",
    store_cart_address_add_suffix: " add a saved address.",
    store_cart_eta_ref: "ETA (estimate): {label}",
    store_cart_eta_manual_hint: "Enter manual delivery time in store settings to show ETA here.",
    store_cart_eta_confirm: "Confirm ETA (estimate)",
    store_cart_other_store_carts_prefix: "Other stores (",
    store_cart_other_store_carts_suffix:
      ") also have carts. Clear or checkout those carts before using this store.",
    store_cart_clear_this_store: "Clear this store",
    store_cart_open_cart: "Open cart",
    store_cart_items_line: "{name} · {count} items · {amount}",
    store_submit_store_delivery: "Place delivery order",
    store_min_order_match_short: "Reach at least {amount} for the minimum order.",
    store_err_pickup_combo: "Pickup is not available for this store and cart.",
    store_err_delivery_not_offered: "This store does not offer delivery. Change fulfillment.",
    store_err_shipping_items_in_cart: "Some cart items cannot be delivered or shipped.",
    store_err_region_only_address:
      "Region-only delivery addresses cannot be used. Delete it and pick a full address.",
    store_err_select_delivery_address:
      "Delivery: check My page addresses or add one, then select a delivery address.",
    store_err_saved_address_required:
      "Delivery: select a saved address. Save one in address manager before ordering.",
    store_err_delivery_address_incomplete:
      "Delivery: the address needs region, neighborhood, or {streetLabel} (3+ chars).",
    store_checkout_phone_partial: "{phone} (incomplete)",
    store_checkout_not_entered: "(not entered)",
    store_err_payment_method: "Check payment method. Only store-allowed methods can be used.",
    store_err_delivery_address_required: "Enter a delivery or shipping address.",
    store_err_pickup_disabled: "This store does not accept pickup orders. Change fulfillment.",
    store_err_delivery_disabled: "This store does not offer delivery. Change fulfillment.",
    store_err_delivery_out_of_range: "Your selected address is outside this store's delivery range.",
    store_err_delivery_store_coords_required:
      "This store has not registered a delivery location yet, so delivery orders are unavailable.",
    store_err_delivery_customer_coords_required:
      "Your delivery address is missing map coordinates. Please save the address again.",
    store_view_menu_link: "View {storeName} menu",
    store_checkout_request_owner_hint:
      "If provided, this appears as the customer request on the store owner's order screen.",
    store_delivery_courier_line: "Delivery partner (info): {label}",
    store_err_mixed_store_cart: "You can only order from one store at a time.",
    store_err_sold_out_in_cart: "Your cart includes sold-out items. Update the cart and try again.",
    store_err_product_stopped_in_cart:
      "Your cart includes items that are no longer for sale. Update the cart and try again.",
    store_err_price_changed_cart: "Menu prices changed. Please review your cart again.",
    store_err_required_option_changed_cart:
      "Required options changed. Please review your cart again.",
    store_err_delivery_region_city_required: "Select a delivery region and city.",
    store_err_delivery_address_invalid:
      "The selected delivery address was not found or does not belong to you.",
    store_err_payment_method_select: "Please select a payment method.",
    store_owner_notifications_title: "Notifications",
    store_owner_notification_settings_title: "Notification settings",
    store_owner_slug_not_found: "Store not found. Check the address (slug).",
    store_owner_go_order_management: "Order management",
    store_owner_notif_login_only: "Only a signed-in store owner account can change these settings.",
    store_owner_notif_table_missing: "The notification settings table is not ready yet.",
    store_owner_notif_load_failed: "Could not load settings.",
    store_owner_notif_settings_link_suffix:
      " to adjust trade and community messenger alerts together.",
    store_owner_notif_order_label: "Order alerts",
    store_owner_notif_order_desc: "New orders, cancel, refund, payment, etc.",
    store_owner_notif_store_label: "Store & sales alerts",
    store_owner_notif_store_desc: "In-app alerts for store operations",
    store_owner_notif_sound: "In-app sound",
    store_owner_notif_vibration: "Vibration",
    store_owner_status_pending: "New",
    store_owner_status_accepted: "Confirmed",
    store_owner_status_preparing: "Preparing",
    store_owner_status_ready_for_pickup: "Ready for pickup",
    store_owner_status_delivering: "Out for delivery",
    store_owner_status_arrived: "Arrived",
    store_owner_status_completed: "Completed",
    store_owner_status_cancel_requested: "Cancel requested",
    store_owner_status_cancelled: "Cancelled",
    store_owner_status_refund_requested: "Refund requested",
    store_owner_status_refunded: "Refunded",
    store_owner_tab_all: "All",
    store_owner_tab_new: "New",
    store_owner_tab_active: "In progress",
    store_owner_tab_done: "Done",
    store_owner_tab_issue: "Cancel & issues",
    store_owner_tab_issue_short: "Cancel & refund",
    store_owner_transition_accepted: "Confirm order",
    store_owner_transition_preparing: "Start preparing",
    store_owner_transition_ready: "Ready for pickup",
    store_owner_transition_delivering: "Out for delivery",
    store_owner_transition_arrived: "Mark arrived",
    store_owner_transition_completed: "Complete delivery",
    store_owner_action_reject_order: "Reject order",
    store_owner_action_cancel_order: "Cancel order",
    store_owner_action_applied: "{label} applied",
    store_owner_refund_requested_notice:
      "The customer requested a refund. Use the business console or admin workflow.",
    store_owner_refunded_notice: "This order has been refunded.",
    store_owner_no_permission: "You do not have owner access to this store.",
    store_owner_store_load_failed: "Could not load store information.",
    store_owner_refresh: "Refresh",
    store_owner_timeline_status_change: "Status update",
    store_owner_order_placed_at: "Ordered at",
    store_owner_eta_recalc_hint:
      "ETA is recalculated when the customer or store address changes. Actual time may vary.",
    store_owner_courier_fee_notice:
      "Informational only; not charged separately from items and delivery fee.",
    store_shipping_fee: "Shipping fee",
    store_fee_other: "Other",
    store_owner_notif_login_to_view: "Sign in to view notifications.",
    store_owner_notif_tab_all: "All",
    store_owner_notif_group_new_orders: "New orders",
    store_owner_notif_group_cancel_payment: "Cancel & payment",
    store_owner_notif_group_refund: "Refund",
    store_owner_notif_mark_all_read: "Mark all store notifications read",
    store_owner_notif_mark_all_busy: "Working…",
    store_owner_notif_empty: "No notifications yet.",
    store_owner_notif_inbox_unread: "{count} unread",
    store_owner_notif_order_no_label: "Order no. {orderNo}",
    store_owner_notif_view_order: "View order",
    store_owner_notif_mark_read: "Mark read",
    store_owner_notif_settings_link: "Notification settings",
    store_owner_notif_all_link: "All notifications",
    store_owner_view_detail: "View details",
    store_owner_customer_inquiry: "Customer chat",
    store_owner_order_items_loading: "Loading order items…",
    store_owner_reject_after_accept_warn:
      "This order was already accepted. Rejecting may upset the customer or trigger refunds.",
    store_owner_reject_confirm: "Confirm reject",
    store_owner_order_not_found: "Order not found.",
    store_owner_back_to_list: "Back to list",
    store_owner_back_to_store: "Back to store",
    store_owner_chats_loading: "Loading…",
    store_owner_chats_login_hint: "Sign in to view order chats and status.",
    store_owner_chats_login_cta: "Sign in to view orders",
    store_owner_chats_retry: "Try again",
    store_owner_chats_no_store: "Store not found at this address or you lack access.",
    store_owner_chats_business_orders: "Business order inbox",
    store_owner_chats_title: "Order chat",
    store_owner_chats_open_delivery: "Open delivery inbox",
    store_owner_chats_go_orders: "Order management",
    store_owner_chats_need_store: "Select a store and try again.",
    store_owner_chats_list_hint: "{storeName} · Chats linked to this store’s orders only.",
    store_owner_chats_empty_title: "No order chats",
    store_owner_chats_empty_hint: "Chats appear here when orders arrive.",
    store_owner_step_confirm_title: "Change step",
    store_owner_open_chat_btn: "Open chat",
    store_owner_chat_connecting: "Connecting chat…",
    store_owner_back_to_orders: "Back to orders",
    store_owner_buyer_note_title: "Special notes",
    store_owner_open_in_messenger: "Open in Messenger",
    store_owner_view_order_detail_short: "View order details",
    store_owner_inquiry_shortcut: "Inquiries",
    store_owner_notif_bell: "Notifications",
    store_owner_notif_bell_refund: "Notifications · {count} refund requests",
    store_owner_notif_refund_link: "{count} refund requests ·",
    store_owner_notif_go_orders: "Order management",
    store_owner_tab_empty: "No orders in this tab.",
    store_owner_problem_order_hint:
      "Saves a memo for admin review. (Sample: order status changes to refund requested.)",
    store_owner_err_server_config: "Check server configuration.",
    store_owner_err_load_list: "Could not load the list.",
    store_owner_err_network: "Network error",
    store_biz_chat_connect: "Open chat",
    store_biz_payment_line: "Payment {payment}",
    store_biz_platform_locked: "Platform locked",
    store_biz_prep_delayed: "Prep delayed",
    store_biz_refund_badge: "Refund requested",
    store_biz_accepted_prefix: "Accepted",
    store_biz_auto_complete_at: "Auto-complete at {at}",
    store_biz_tab_cancelled: "Cancelled",
    store_biz_login_view_orders: "Sign in to view orders",
    store_biz_apply_store: "Apply for a store",
    store_biz_retry: "Try again",
    store_biz_badge_delivery_waiting: "Delivery waiting {count}",
    store_biz_badge_accept_waiting: "Accept pending {count}",
    store_biz_badge_refund_count: "{count} refund requests",
    store_biz_pending_accept_banner: "{count} order(s) waiting for acceptance.",
    store_biz_refund_admin_banner:
      "Refund requests are open. Status updates when approved in admin.",
    store_biz_view_operations: "Store operations",
    store_biz_check_store_info: "Review store info",
    store_biz_sla_pending_over_5m: "Order idle",
    store_biz_sla_eta_overdue: "ETA overdue",
    store_biz_sla_delivery_over_60m: "Long delivery",
    store_biz_sla_unassigned_over_10m: "Unassigned",
    store_biz_sla_refund_overdue: "Refund overdue",
    store_biz_sla_admin_attention: "Ops review",
    store_biz_sla_level: "SLA {level}",
    store_biz_patch_err_prep_minutes: "Select prep time between 1–180 minutes.",
    store_biz_patch_err_invalid_transition: "This action is not allowed at the current step.",
    store_biz_patch_err_stale_reconciled: "This order was already updated. The screen is now in sync.",
    store_biz_patch_err_admin_locked: "This order is locked by the platform. Contact support.",
    store_biz_patch_err_cancel_reason_required: "Select a cancellation reason.",
    store_biz_patch_err_points_insufficient:
      "Insufficient Business Credit to accept this order. Please top up and try again.",
    store_biz_refund_requested_owner_notice:
      "Customer requested a refund. Approve in admin (delivery orders) to update stock and settlement.",
    store_biz_delivery_actions_title: "Delivery & order actions",
    store_biz_delivery_actions_hint:
      "Change progress or cancel here while chatting. ({status})",
    store_biz_modal_delivery_hint:
      "Handle delivery steps here; order details and chat are under ⋯ on the right.",
    store_biz_refund_requested_banner: "Refund requested — updates when approved in admin.",
    store_messenger_order_fallback: "Delivery / store order",
    store_messenger_order_title: "{store} · Order {orderNo}",
    store_messenger_list_order_no: "Order no. {orderNo}",
    store_messenger_delivery_order_title: "Delivery order",
    store_messenger_progress_drawer_title: "Order progress",
    store_messenger_chrome_order_btn: "Order",
    store_messenger_chrome_history_btn: "History",
    store_delivery_chat_placeholder_buyer: "Enter an order-related request",
    store_delivery_chat_placeholder_owner: "Enter an operations notice",
    store_delivery_chat_input_placeholder: "Message",
    store_delivery_chat_quick_replies_aria: "Quick replies",
    store_delivery_chat_quick_confirm: "Yes, confirmed",
    store_delivery_chat_quick_door: "Please leave at the door",
    store_delivery_chat_quick_address: "I'll explain the address",
    store_delivery_chat_quick_call: "Please call me",
    store_delivery_ops_title_pending: "New order",
    store_delivery_ops_title_accepted: "Order received",
    store_delivery_ops_title_preparing: "Preparing",
    store_delivery_ops_title_ready: "Ready",
    store_delivery_ops_title_delivering: "Out for delivery",
    store_delivery_ops_title_arrived: "Arrived",
    store_delivery_ops_title_completed: "Complete",
    store_delivery_ops_title_warning: "Notice",
    store_delivery_ops_title_progress: "Order update",
    store_delivery_ops_body_accepted: "Your order has been accepted.",
    store_delivery_ops_body_accepted_prep: "Your order has been accepted. Estimated prep time is about {minutes} min.",
    store_delivery_ops_body_preparing: "Your order is being prepared.",
    store_delivery_ops_body_ready_delivery: "Your order is ready. Delivery will start soon.",
    store_delivery_ops_body_ready_pickup: "Your order is ready for pickup.",
    store_delivery_ops_body_delivering: "Delivery has started.",
    store_delivery_ops_body_completed_delivery: "Delivery is complete.",
    store_delivery_ops_body_completed_pickup: "Your order is complete. Please pick it up.",
    store_delivery_ops_body_generic: "Your order status has been updated.",
    store_messenger_order_in_progress: "Order in progress",
    store_messenger_cancel_failed: "Could not cancel the order.",
    store_messenger_store_address_label: "Store address",
    store_messenger_receipt_order_delivery: "Delivery order",
    store_messenger_receipt_order_pickup: "Pickup order",
    store_messenger_receipt_order_line: "Order {orderNo}",
    store_messenger_receipt_items_heading: "Order items",
    store_messenger_receipt_col_item: "Item",
    store_messenger_receipt_col_option: "Options",
    store_messenger_receipt_col_qty: "Qty",
    store_messenger_receipt_col_amount: "Amount",
    store_messenger_receipt_no_items: "No item details available.",
    store_messenger_receipt_payment_total: "Payment total",
    store_messenger_receipt_payment_method: "Payment method",
    store_messenger_receipt_prep_time: "Estimated prep time",
    store_messenger_receipt_prep_minutes: "About {minutes} min",
    store_messenger_timeline_in_progress: "In progress",
    store_messenger_timeline_scheduled: "Scheduled",
    store_messenger_owner_next_label: " → Next: {label}",
    store_messenger_owner_accept_prompt: "Choose whether to accept this order.",
    store_messenger_owner_progress_prompt: "Use the buttons below to update order progress.",
    store_messenger_owner_status_locked: "Order status cannot be changed from chat at this stage.",
    store_messenger_buyer_step_new: "New",
    store_messenger_buyer_step_accepted: "Accepted",
    store_messenger_buyer_step_preparing: "Preparing",
    store_messenger_buyer_step_delivery_ready: "Ready to deliver",
    store_messenger_buyer_step_delivering: "Delivering",
    store_messenger_buyer_step_near_address: "Near address",
    store_messenger_buyer_step_completed: "Done",
    store_messenger_buyer_step_pickup_ready: "Ready for pickup",
    store_messenger_buyer_step_pickup_done: "Picked up",
    store_messenger_progress_step_new_order: "New order",
    store_messenger_progress_step_accepted: "Accepted",
    store_messenger_progress_step_preparing: "Preparing",
    store_messenger_progress_step_delivery_ready: "Ready to deliver",
    store_messenger_progress_step_delivering: "Delivering",
    store_messenger_progress_step_near_address: "Near address",
    store_messenger_progress_step_done: "Complete",
    store_messenger_progress_step_pickup_ready: "Ready for pickup",
    store_messenger_progress_step_pickup_done: "Picked up",
    store_search_chip_chicken: "Chicken",
    store_search_chip_pizza: "Pizza",
    store_search_chip_korean: "Korean",
    store_search_chip_bunsik: "Snacks",
    store_search_chip_cafe: "Cafe",
    store_search_chip_lunchbox: "Lunch box",
    store_search_chip_mart: "Mart",
    store_search_chip_jokbal: "Jokbal",
    store_search_chip_latenight: "Late night",
    store_search_chip_free_delivery: "Free delivery",
    store_biz_my_store_fallback: "My store",
    store_biz_order_chat_modal_body:
      "Delivery and store order chats continue in the Messenger delivery inbox.",
    store_pay_label_cod: "COD",
    store_pay_label_gcash: "GCash",
    store_pay_label_bank_transfer: "Bank transfer",
    store_pay_label_other: "Other",
    store_pay_label_card_on_delivery: "Card (pay on delivery)",
    store_pay_display_cash_meet: "COD",
    store_pay_methods_fallback: "GCash, COD, etc. (confirm with store)",
    store_owner_mobile_filter_all_types: "All types",
    store_owner_mobile_filter_delivery_only: "Delivery only",
    store_owner_mobile_filter_pickup_only: "Pickup only",
    store_owner_mobile_kpi_new: "New orders",
    store_owner_mobile_kpi_preparing: "Preparing",
    store_owner_point_title: "Business Credit",
    store_owner_point_balance_label: "Business Credit balance",
    store_owner_point_blocked_badge: "Orders blocked",
    store_owner_point_blocked_message:
      "Business Credit is too low to accept new orders. Customers will see your store as preparing.",
    store_owner_point_charge_cta: "Request Business Credit top-up",
    store_owner_point_account_cta: "Deposit account inquiry",
    store_owner_point_section_account: "Deposit account inquiry",
    store_owner_point_section_charge: "Business Credit top-up request",
    store_owner_point_balance_current: "Current Business Credit",
    store_owner_point_charge_ratio_hint: "Business Credit top-up and payment amount are 1:1 for now.",
    store_owner_point_inquiry_cta: "Contact admin",
    store_owner_point_ledger_title: "Recent activity",
    store_owner_point_ledger_empty: "No Business Credit history yet.",
    store_owner_point_estimated_orders: "Est. orders you can accept",
    store_owner_point_estimated_orders_unit: "About {count}",
    store_owner_point_charge_title: "Top up Business Credit",
    store_owner_point_charge_amount: "Business Credit to add",
    store_owner_point_charge_payment: "Payment amount (PHP)",
    store_owner_point_charge_depositor: "Depositor name",
    store_owner_point_charge_bank: "Bank",
    store_owner_point_charge_receipt: "Receipt URL",
    store_owner_point_charge_memo: "Memo",
    store_owner_point_charge_submit: "Submit request",
    store_owner_point_charge_pending: "Pending approval",
    store_owner_point_charge_on_hold:
      "On hold while admin reviews. You can submit another request after this is resolved.",
    store_owner_point_entry_store_order_fee: "Order fee",
    store_owner_point_entry_store_charge: "Top-up",
    store_owner_point_entry_admin_adjust: "Admin adjustment",
    store_owner_point_step_account: "1. Request deposit account",
    store_owner_point_step_awaiting: "2. Awaiting account details",
    store_owner_point_step_deposit: "3. Submit deposit",
    store_owner_point_step_charge_pending: "Top-up pending approval",
    store_owner_point_account_inquiry_intro:
      "Request deposit account details if needed. This is separate from top-up requests.",
    store_owner_point_account_inquiry_submit: "Request deposit account",
    store_owner_point_account_inquiry_pending: "Please wait until an admin shares the deposit account.",
    store_owner_point_account_answer_title: "Deposit account details",
    store_owner_point_account_answer_hint: "Account details from admin.",
    store_owner_point_account_inquiry_already_open: "An account inquiry is already open.",
    store_owner_point_deposit_blocked_hint: "You can request a top-up after receiving deposit account details.",
    store_owner_point_charge_history_title: "Top-up requests",
    store_owner_point_charge_history_empty: "No top-up requests yet.",
    store_owner_point_charge_status_pending: "Pending",
    store_owner_point_charge_status_waiting: "Awaiting deposit",
    store_owner_point_charge_status_approved: "Approved",
    store_owner_point_charge_status_rejected: "Rejected",
    store_owner_point_charge_status_hold: "On hold",
    store_owner_point_inquiry_status_open: "Awaiting reply",
    store_owner_point_inquiry_status_answered: "Answered",
    store_owner_point_inquiry_status_closed: "Closed",
    store_owner_point_err_account_inquiry_required: "Please request a deposit account first.",
    store_owner_point_err_account_inquiry_not_answered: "Submit a top-up after you receive account details from admin.",
    store_owner_point_err_charge_already_pending: "You already have a pending top-up request.",
    store_owner_point_err_account_inquiry_already_open: "An account inquiry is already in progress.",
    store_owner_point_err_platform_unavailable: "Business Credit is being set up. Please try again later.",
    store_owner_point_err_point_amount_required: "Enter at least 1 Business Credit to top up.",
    store_owner_point_err_depositor_name_required: "Enter the depositor name.",
    store_owner_point_err_subject_required: "Enter a subject and message.",
    store_owner_point_dashboard_awaiting_account: "Waiting for deposit account details.",
    store_owner_point_dashboard_charge_pending: "Top-up approval is pending.",
    store_err_point_blocked: "This store is preparing and cannot take orders right now.",
    store_owner_mobile_kpi_delivering: "Out for delivery",
    store_owner_mobile_kpi_done_today: "Completed today",
    store_owner_mobile_search_placeholder: "Search order no., buyer, or phone",
    store_owner_mobile_sort_newest: "Newest ▾",
    store_owner_mobile_sort_oldest: "Oldest ▾",
    store_owner_mobile_empty_title: "No orders to show",
    store_owner_mobile_empty_hint: "Try another tab or change filters.",
    store_owner_orders_deeplink_miss_title: "Order from this alert not found",
    store_owner_orders_deeplink_miss_body:
      "It may already be completed or cancelled, or the list may still be updating. Refresh or check another tab.",
    store_owner_orders_deeplink_miss_refresh: "Refresh list",
    store_owner_orders_deeplink_miss_try_tab: "Check {tab}",
    store_owner_orders_deeplink_wrong_tab_title: "This order is on another tab",
    store_owner_orders_deeplink_wrong_tab_body:
      "The tab from the alert may not match the order status. Open the correct tab below.",
    store_owner_orders_deeplink_wrong_tab_open: "Open in {tab}",
    store_owner_mobile_aria_search: "Search orders",
    store_owner_mobile_aria_filter: "Filter orders",
    store_owner_fulfillment_pickup_short: "Pickup",
    store_owner_fulfillment_delivery_short: "Delivery",
    store_owner_order_type_delivery: "Delivery order",
    store_owner_order_type_pickup: "Pickup order",
    store_owner_order_detail_title: "Order details",
    store_owner_order_detail_loading: "Loading order…",
    store_owner_order_info_section: "Order info",
    store_owner_order_type_label: "Order type",
    store_owner_payment_method_label: "Payment",
    store_owner_payment_amount_label: "Amount",
    store_owner_order_time_label: "Ordered at",
    store_owner_prep_estimate_label: "Prep estimate",
    store_owner_prep_about_minutes: "About {minutes} min",
    store_owner_delivery_address_section: "Delivery address",
    store_owner_order_menu_section: "Items",
    store_owner_order_line_short: "Order {no}",
    store_owner_order_chat_line: "{orderNo} · {storeName}",
    store_owner_order_fallback: "Order",
    store_owner_store_fallback: "Store",
    store_owner_elapsed_hours: "{hours}h {minutes}m ago",
    store_owner_elapsed_minutes: "{minutes}m {seconds}s ago",
    store_owner_timeline_refund_pending: "Refund request in progress.",
    store_owner_timeline_refund_done: "This order was refunded.",
    store_owner_timeline_cancelled: "This order was cancelled.",
    store_owner_cancel_order_btn: "Cancel order",
    store_owner_cancel_request_btn: "Request cancellation",
    store_owner_cancel_sheet_title: "Cancel order",
    store_owner_cancel_request_sheet_title: "Cancellation request",
    store_owner_cancel_sheet_desc: "Choose a cancellation reason. Orders before cooking can be cancelled immediately.",
    store_owner_cancel_request_sheet_desc:
      "Orders after cooking starts may not be cancelled immediately. Admin review is required.",
    store_owner_cancel_requested_notice: "Cancellation request submitted. Admin will review it.",
    store_owner_cancel_policy_direct: "This order can be cancelled by the store.",
    store_owner_cancel_policy_request: "After cooking starts, stores can only request cancellation.",
    store_owner_cancel_policy_admin_review: "Admin review is required.",
    store_owner_cancel_policy_picked_up: "Already picked-up orders are handled through support.",
    store_owner_cancel_policy_terminal: "This order is already cancelled or under refund review.",
    store_owner_order_card_actions_aria: "Order card actions",
    store_owner_aria_order_detail: "Order details",
    store_owner_aria_back_orders: "Back to orders",
    store_owner_aria_order_chat: "Order chat",
    store_owner_aria_exit_orders: "Leave order chat",
    store_owner_aria_dashboard: "Back to dashboard",
    store_owner_aria_open_menu: "Open menu",
    store_owner_aria_exit_delivery_home: "Back to delivery home",
    store_owner_aria_store_ops: "Store operations",
    store_owner_aria_select_store: "Select store",
    store_owner_aria_notifications: "Notifications ({count})",
    store_owner_aria_notifications_unread_only: "Unread notifications",
    store_owner_ops_open: "Open",
    store_owner_ops_paused: "Paused",
    store_owner_ops_prep_minutes: "Prep ~{minutes} min",
    store_owner_ops_set_hours: "Set business hours",
    store_owner_expand_ops_menu: "Expand operations menu",
    store_owner_my_home_link: "← My profile (home)",
    store_owner_order_progress_chat_title: "Order progress chat",
    store_owner_ops_order_chat_label: "Operations order chat",
    store_owner_payment_review_section: "Payment & review",
    store_owner_rider_status_line: "Rider status: {status}",
    store_owner_no_menu_info: "No menu details.",
    store_owner_dash_customer_care: "Customer care",
    store_owner_dash_inventory_issues: "Operations issues",
    store_owner_dash_order_flow: "Order pipeline",
    store_owner_dash_today_summary: "Today at a glance",
    store_owner_dash_refresh_ops: "Refresh operations data",
    store_owner_dash_updated_at: "Updated {time}",
    store_owner_dash_no_urgent: "No urgent orders right now.",
    store_owner_dash_urgent_title: "Needs attention",
    store_owner_dash_new_orders: "New orders",
    store_owner_dash_wait_over_3m: "{count} unaccepted for 3+ min",
    store_owner_dash_waiting_accept: "Awaiting acceptance",
    store_owner_dash_cooking_delay: "Prep delay",
    store_owner_dash_over_eta: "Past estimated time",
    store_owner_dash_delivery_delay: "Delivery delay",
    store_owner_dash_rider_unassigned: "No rider assigned",
    store_owner_dash_delivery_delayed_occurred: "Delivery delay reported",
    store_owner_dash_unconfirmed_orders: "Unconfirmed orders",
    store_owner_dash_unconfirmed_over_3m: "Unconfirmed for 3+ min",
    store_owner_dash_confirm_done: "All confirmed",
    store_owner_dash_review_orders_btn: "Review orders",
    store_owner_dash_status_normal: "Normal",
    store_owner_dash_offline_stale: "Offline — showing cached data",
    store_owner_dash_offline_network: "Check your network connection",
    store_owner_dash_flow_waiting: "Waiting",
    store_owner_dash_flow_cooking: "Preparing",
    store_owner_dash_flow_delivering: "Delivering",
    store_owner_dash_flow_done: "Done",
    store_owner_dash_delay_count: "{count} delayed",
    store_owner_dash_today_order_count: "Today's orders",
    store_owner_dash_count_orders: "{count} orders",
    store_owner_dash_today_sales: "Today's sales",
    store_owner_dash_avg_order_value: "Avg. order value",
    store_owner_dash_cancel_rate: "Cancel rate",
    store_owner_dash_view_detail: "View details",
    store_owner_dash_view_all: "View all",
    store_owner_dash_delta_vs_yesterday: "{sign}{delta}% vs yesterday",
    store_owner_dash_unanswered_chat: "Unanswered chats",
    store_owner_dash_reply_needed: "Reply needed",
    store_owner_dash_no_new_10m: "No new messages in 10 min",
    store_owner_dash_review_reply: "Review replies",
    store_owner_dash_response_needed: "Response needed",
    store_owner_dash_done: "Done",
    store_owner_dash_refund_requests: "Refund requests",
    store_owner_dash_action_needed: "Action needed",
    store_owner_dash_none: "None",
    store_owner_dash_claims: "Claims",
    store_owner_dash_no_new_claims: "No new claims",
    store_owner_dash_chat_shortcut: "Open chat",
    store_owner_dash_sold_out: "Sold out",
    store_owner_dash_check_stock: "Check stock",
    store_owner_dash_hidden: "Hidden items",
    store_owner_dash_check_sales_status: "Check sales status",
    store_owner_dash_sale_suspended: "Sales paused",
    store_owner_dash_draft_unpublished: "Draft or unpublished",
    store_owner_dash_option_errors: "Option errors",
    store_owner_dash_fix_needed: "Fix required",
    store_owner_dash_check_scheduled: "Check scheduled sales",
    store_owner_dash_count_items: "{count} items",
    store_owner_flow_aria_waiting: "Waiting step",
    store_owner_flow_aria_cooking: "Preparing step",
    store_owner_flow_aria_delivering: "Delivering step",
    store_owner_flow_aria_done: "Completed step",
    store_owner_orders_login_hint: "Sign in to view store orders.",
    store_owner_mobile_tab_new_orders: "New",
    store_owner_mobile_tab_progress: "In progress",
    store_owner_mobile_tab_shipping: "Delivering",
    store_owner_mobile_tab_done: "Done",
    store_owner_mobile_tab_cancelled: "Cancelled",
    store_owner_pull_release_refresh: "Release to refresh",
    store_owner_pull_hint: "Pull down to refresh",
    store_home_pull_hint: "Pull down to refresh",
    store_home_pull_release: "Release to refresh",
    store_home_pull_refreshing: "Refreshing…",
    store_owner_bottom_nav_home: "Home",
    store_owner_bottom_nav_dashboard: "Dashboard",
    store_owner_bottom_nav_order_chat: "Order chat",
    store_owner_bottom_nav_orders: "Orders",
    store_owner_bottom_nav_menu: "Menu",
    store_owner_bottom_nav_settings: "Store",
    store_owner_hub_avatar_fallback: "S",
    store_owner_chat_room_open_failed: "Could not open chat.",
    store_owner_chat_room_missing: "No chat room linked.",
    store_owner_chat_network_failed: "Network error. Could not open chat.",
    store_buyer_public_label_fallback: "Customer",
    store_owner_call_buyer: "Call buyer",
    store_owner_cancel_not_allowed: "Cancellation isn't allowed at this stage.",
    store_owner_card_chat: "Chat",
    store_owner_card_collapse: "Collapse",
    store_owner_card_expand: "Expand",
    store_owner_chat_load_failed: "Couldn't load chat.",
    store_owner_chat_order_context_missing: "Missing order context; can't open chat.",
    store_owner_delivery_info_section: "Delivery info",
    store_owner_est_arrival_suffix: " · ETA {minutes} min",
    store_owner_est_prep_line: "Prep {prep}",
    store_owner_est_prep_unknown: "Prep time TBD",
    store_owner_label_receipt: "Receipt",
    store_owner_label_review_short: "Review",
    store_owner_menu_summary_extra: " +{count} more",
    store_owner_menu_summary_line: "{title} ×{qty}{extra}",
    store_owner_menu_summary_none: "No items",
    store_owner_network_patch_failed: "Network error; could not update.",
    store_owner_no_address: "No delivery address",
    store_owner_no_request_note: "No requests",
    store_owner_open_btn: "Open",
    store_owner_pickup_info_section: "Pickup info",
    store_owner_pickup_order_hint: "Store pickup order.",
    store_owner_status_auto_log: "Order status is logged automatically.",
    store_owner_step_tap_aria: "Advance to {label}",
    store_owner_stepper_aria: "Order progress steps",
    store_owner_confirm_buyer_fallback: "Customer",
    store_owner_confirm_accepted: "Accept order for {who}?",
    store_owner_confirm_preparing: "Start preparing for {who}?",
    store_owner_confirm_ready_delivery: "Mark packing complete for {who}?",
    store_owner_confirm_ready_pickup: "Mark pickup ready for {who}?",
    store_owner_confirm_delivering: "Start delivery for {who}?",
    store_owner_confirm_arrived: "Mark arrived for {who}?",
    store_owner_confirm_completed_delivery: "Complete delivery for {who}?",
    store_owner_confirm_completed_pickup: "Mark pickup complete for {who}?",
    store_owner_confirm_status_change: "Change order status for {who}?",
    store_owner_step_preparing_short: "Start prep",
    store_owner_step_ready_complete: "Packed",
    store_owner_step_pickup_waiting: "Awaiting pickup",
    store_owner_step_delivery_start: "Out for delivery",
    store_owner_step_arrived_short: "Arrived",
    store_owner_step_delivery_done: "Delivered",
    store_owner_step_start_preparing: "Start prep",
    store_owner_step_pickup_done: "Picked up",
    store_owner_ops_status_ready_delivery: "Ready for delivery",
    store_owner_ops_status_ready_pickup: "Ready for pickup",
    store_owner_ops_status_completed_delivery: "Delivered",
    store_owner_ops_status_completed_pickup: "Picked up",
    store_order_process_step_ready_dispatch: "Ready for dispatch",
    store_owner_ops_flow_new: "New",
    store_owner_ops_flow_accepted: "Accepted",
    store_owner_ops_flow_cooking: "Preparing",
    store_owner_ops_flow_delivery_ready: "Ready to deliver",
    store_owner_ops_flow_delivering: "Delivering",
    store_owner_ops_flow_near_address: "Near address",
    store_owner_ops_flow_done: "Done",
    store_owner_ops_flow_pickup_ready: "Pickup ready",
    store_owner_ops_flow_pickup_done: "Pickup done",
    store_owner_rider_waiting: "Waiting for rider",
    store_owner_rider_assigned: "Rider assigned",
    store_owner_rider_pickup_progress: "Picking up",
    store_owner_rider_delivering: "Delivering",
    store_owner_rider_delivered: "Delivered",
    store_owner_rider_failed: "Delivery failed",
    store_owner_review_status_pending: "Review pending",
    store_owner_review_status_completed: "Reviewed",
    store_owner_review_status_unavailable: "Review unavailable",
    store_owner_review_status_na: "—",
    store_owner_order_review_section: "Customer review",
    store_owner_order_review_pending: "Waiting for the customer's review.",
    store_owner_order_review_empty: "No review yet.",
    store_owner_order_review_unavailable: "Reviews are unavailable.",
    store_owner_order_review_private_badge: "Owner only",
    store_owner_order_review_rating_aria: "Rating {n} stars",
    store_owner_order_review_card_badge: "Review",
    store_owner_order_review_card_badge_aria: "Customer left a review",
    store_owner_order_review_photo_alt: "Review photo",
    store_owner_quick_reply_late: "Running a bit late",
    store_owner_quick_reply_door: "Leave at the door",
    store_owner_quick_reply_ingredients: "Ingredients question",
    store_owner_quick_reply_call: "Please call",
    store_owner_settlement_guide_title: "Settlement guide",
    store_owner_settlement_pick_store_body: "Select an active store to view settlements.",
    store_owner_settlement_go_hub: "Back to my stores",
    store_owner_settlement_intro:
      "A settlement entry is created when an order is completed. Payouts and holds are handled by platform ops; this screen is read-only.",
    store_owner_settlement_delay_days: "Payout is scheduled about {days} days after completion.",
    store_owner_settlement_fee_percent: "Effective fee {percent}%",
    store_owner_settlement_fee_rate: "Fee for new completions {rate}",
    store_owner_settlement_fee_current_hint:
      "The rate above is the current policy. Per-order settlement rows keep the fee snapshotted at completion.",
    store_owner_settlement_fee_source: "Policy source: {source}",
    store_owner_settlement_fee_source_store: "Store override",
    store_owner_settlement_fee_source_topic: "Secondary category policy",
    store_owner_settlement_fee_source_category: "Primary category policy",
    store_owner_settlement_fee_source_default: "Platform default policy",
    store_owner_settlement_fee_source_commerce_settings: "Commerce settings (legacy)",
    store_owner_settlement_rate_line:
      "Applied rate {rate} · base {base} · platform recognized {revenue} · reversal {reversal}",
    store_owner_settlement_order_status_line: "Order {status} · paid {paid}",
    store_owner_settlement_filter_from: "From",
    store_owner_settlement_filter_to: "To",
    store_owner_settlement_filter_order_no: "Order number",
    store_owner_settlement_period_hint:
      "Period uses settlement ledger created_at (completion recognition). Header rate is current policy; per-order fees use snapshots.",
    store_owner_settlement_refreshing: "Refreshing…",
    store_owner_settlement_manage_orders: "Manage orders",
    store_owner_settlement_loading: "Loading…",
    store_owner_settlement_empty: "No settlements yet. They appear after orders complete.",
    store_owner_settlement_list_title: "Settlement history",
    store_owner_settlement_summary_title: "Summary",
    store_owner_settlement_filter_title: "Filter by status",
    store_owner_settlement_summary_basis: "Pending = scheduled/processing/held; paid = paid only.",
    store_owner_settlement_summary_count: "{label} · {count} orders",
    store_owner_settlement_summary_gross: "Gross sales",
    store_owner_settlement_summary_platform_fee: "Platform & fixed fees",
    store_owner_settlement_summary_delivery: "Delivery deductions",
    store_owner_settlement_summary_refund: "Refunds",
    store_owner_settlement_summary_pending: "Pending payout",
    store_owner_settlement_summary_paid: "Paid out",
    store_owner_settlement_row_order: "Order {no}",
    store_owner_settlement_due_date: "Due {date}",
    store_owner_settlement_paid_at: "Paid {date}",
    store_owner_settlement_amount_line: "Sales {gross} · Fee {fee} · Refund {refund}",
    store_owner_settlement_fee_line: "Platform {platform} · Fixed {fixed} · Delivery {delivery}",
    store_owner_settlement_hold: "Hold: {reason}",
    store_owner_settlement_payout: "Payout confirmed {date}",
    store_owner_settlement_view_order: "View order",
    store_owner_settlement_err_table_missing: "Settlement table is not deployed yet.",
    store_owner_settlement_status_scheduled: "Scheduled",
    store_owner_settlement_status_processing: "Processing",
    store_owner_settlement_status_paid: "Paid",
    store_owner_settlement_status_held: "On hold",
    store_owner_settlement_status_cancelled: "Cancelled",
    store_owner_settlement_filter_empty: "No settlements in this status.",

  },

} as const;

