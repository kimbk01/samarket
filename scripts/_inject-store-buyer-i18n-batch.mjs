import fs from "fs";

const BATCH = {
  store_approval_status_approved: ["승인됨", "Approved"],
  store_approval_status_pending: ["신청대기", "Pending"],
  store_approval_status_rejected: ["반려", "Rejected"],
  store_approval_status_revision_requested: ["보완요청", "Revision requested"],
  store_approval_status_suspended: ["정지", "Suspended"],
  store_approval_status_under_review: ["검토중", "Under review"],
  store_approval_status_unknown: ["상태 미정", "Status unknown"],
  store_avg_rating_label: ["평균 ★ {rating}", "Average ★ {rating}"],
  store_badge_coupon: ["쿠폰", "Coupon"],
  store_banner_slide_aria: ["배너 {index}", "Banner {index}"],
  store_cart_added_short_toast: ["장바구니에 담았어요", "Added to cart"],
  store_cart_aria: ["장바구니", "Cart"],
  store_cart_aria_with_kinds: ["장바구니 · {count}종", "Cart · {count} items"],
  store_cart_entry_sub_api: ["일시적으로 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.", "Could not load right now. Try again shortly."],
  store_cart_entry_sub_gone: ["이 주소의 장바구니를 찾을 수 없습니다.", "No cart found at this address."],
  store_cart_entry_sub_network: ["네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "Check your connection and try again."],
  store_cart_entry_title_network: ["장바구니를 불러오지 못했습니다", "Could not load cart"],
  store_cart_entry_title_not_found: ["장바구니를 찾을 수 없습니다", "Cart not found"],
  store_cart_option_updated_toast: ["옵션을 수정했어요", "Options updated"],
  store_chat_inquiry_menu: ["채팅 문의", "Chat inquiry"],
  store_checkout_phone_profile_hint_account_link: ["내정보 · 계정", "My page · Account"],
  store_checkout_phone_profile_hint_prefix: ["연락처는", "Your phone number is saved in"],
  store_checkout_phone_profile_hint_suffix: ["에서 미리 저장할 수 있어요.", "."],
  store_commerce_summary_disclaimer: ["표시 금액·시간은 매장 설정 기준이며 실제와 다를 수 있습니다.", "Amounts and times are store estimates and may differ."],
  store_confirm_at_order: ["주문 시 확인", "Confirm at checkout"],
  store_content_empty: ["내용 없음", "No content"],
  store_copy_address_btn: ["주소 복사", "Copy address"],
  store_delivery_eta_detail: ["배달 예상 시간은 매장·거리·주문량에 따라 달라질 수 있습니다.", "Delivery ETA varies by store, distance, and order volume."],
  store_delivery_eta_label: ["배달 예상", "Delivery ETA"],
  store_delivery_hours_label: ["배달 시간", "Delivery hours"],
  store_detail_info_address_hint_after: ["에서 주소·연락처·지도를 확인할 수 있어요.", " for address, contact, and map."],
  store_detail_info_address_hint_before: ["자세한 위치는", "See the "],
  store_detail_info_tab_short: ["가게정보", "Store info"],
  store_err_delivery_region_city_google_hint: ["Google 검색으로 저장한 배달 주소를 선택해 주세요.", "Select a delivery address saved via Google search."],
  store_err_delivery_region_unverified: ["배달 지역을 확인할 수 없습니다. 주소를 다시 선택해 주세요.", "Could not verify delivery region. Select the address again."],
  store_err_order_redirect_failed: ["주문 페이지로 이동하지 못했습니다.", "Could not open the order page."],
  store_err_own_store_block: ["본인 매장 상품은 주문할 수 없습니다.", "You cannot order from your own store."],
  store_err_sold_out_cannot_add: ["품절된 메뉴는 담을 수 없습니다.", "Sold-out items cannot be added."],
  store_free_delivery_threshold_line: ["{amount} 이상 무료배달", "Free delivery over {amount}"],
  store_fulfillment_delivery_short: ["배달", "Delivery"],
  store_fulfillment_pickup_short: ["포장", "Pickup"],
  store_location_map_title: ["{store} 위치", "{store} location"],
  store_location_region_barangay: ["지역 · 동네", "Region · barangay"],
  store_location_section_default: ["위치", "Location"],
  store_meta_cart_title: ["장바구니", "Cart"],
  store_meta_checkout_title: ["주문서", "Checkout"],
  store_meta_product_desc: ["{store}의 상품입니다.", "Product from {store}."],
  store_meta_product_title: ["상품", "Product"],
  store_meta_report_desc: ["매장 또는 상품에 대한 신고를 접수합니다.", "Submit a report about a store or product."],
  store_meta_report_title: ["매장·상품 신고", "Report store or item"],
  store_meta_reviews_title: ["리뷰", "Reviews"],
  store_meta_store_info_title: ["가게정보", "Store info"],
  store_messenger_order_chat_label: ["주문 채팅", "Order chat"],
  store_min_order_none: ["최소주문 없음", "No minimum order"],
  store_modifier_count_max: ["최대 {max}개", "Up to {max}"],
  store_modifier_count_max_select: ["최대 {max}개 선택", "Select up to {max}"],
  store_modifier_count_min: ["{min}개 선택", "Select {min}"],
  store_modifier_count_min_select: ["{min}개 이상 선택", "Select at least {min}"],
  store_modifier_count_range: ["{min}~{max}개", "{min}–{max}"],
  store_modifier_count_range_select: ["{min}~{max}개 선택", "Select {min}–{max}"],
  store_modifier_count_upto: ["최대 {max}개", "Up to {max}"],
  store_modifier_optional_chip: ["선택", "Optional"],
  store_my_delivery_orders: ["내 배달·픽업 주문", "My delivery & pickup orders"],
  store_notice_check_fallback: ["매장 공지를 확인해 주세요", "Check store notices"],
  store_notice_store_suffix: ["{store} 공지", "{store} notice"],
  store_options_load_failed: ["옵션을 불러오지 못했습니다", "Could not load options"],
  store_options_loading: ["옵션 불러오는 중…", "Loading options…"],
  store_order_check_my_delivery_hint: ["내 주문함에서 진행 중인 주문을 확인해 보세요.", "Check in-progress orders in My orders."],
  store_order_completed: ["주문이 완료되었습니다", "Order completed"],
  store_payment_check_at_store: ["매장에서 확인", "Ask at store"],
  store_payment_contact_store: ["매장에 문의", "Contact store"],
  store_phone_menu_call: ["전화하기", "Call"],
  store_phone_menu_none: ["전화번호 없음", "No phone number"],
  store_pickup_no_short: ["픽업 불가", "No pickup"],
  store_pickup_yes_short: ["픽업 가능", "Pickup"],
  store_prep_row_prefix: ["예상조리 ", "Prep "],
  store_product_load_failed_short: ["상품을 불러오지 못했습니다", "Could not load product"],
  store_product_sheet_title: ["메뉴 상세", "Item details"],
  store_public_address_detail_label: ["상세 주소", "Address detail"],
  store_public_address_street_label: ["도로명·지번", "Street address"],
  store_report_err_duplicate: ["최근에 같은 내용으로 신고하셨습니다.", "You recently submitted a similar report."],
  store_report_err_empty: ["상세 내용을 입력해 주세요.", "Enter details."],
  store_report_err_failed: ["신고 접수에 실패했습니다.", "Could not submit report."],
  store_report_reason_fraud: ["사기·허위", "Fraud"],
  store_report_reason_harassment: ["괴롭힘·욕설", "Harassment"],
  store_report_reason_illegal: ["불법·위험", "Illegal or dangerous"],
  store_report_reason_misleading: ["허위·과장 정보", "Misleading info"],
  store_report_reason_other: ["기타", "Other"],
  store_report_reason_spam: ["스팸·광고", "Spam"],
  store_report_submit_btn: ["신고하기", "Submit report"],
  store_report_submitting: ["접수 중…", "Submitting…"],
  store_report_target_product: ["이 상품에 대한 신고입니다.", "Reporting this product."],
  store_report_target_store: ["이 매장에 대한 신고입니다.", "Reporting this store."],
  store_store_guide_collapsed_hint: ["· 영업·배달·결제 안내", "· Hours, delivery & payment"],
  store_store_guide_heading: ["매장 안내", "Store guide"],
  store_store_info_menu: ["가게정보", "Store info"],
  store_stores_page_meta_description: ["동네 매장을 지역·검색·업종별로 찾고, 메뉴·상품을 주문해 보세요.", "Find neighborhood stores by area, search, and category — order food and products."],
  store_wrong_store_product: ["이 매장의 메뉴가 아닙니다", "This item is not from this store"],
};

function formatEntry(key, value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `\n    ${key}: "${escaped}",`;
}

function injectLocale(block, localeIndex) {
  const anchor = `    store_modifier_optional: "${localeIndex === 0 ? "선택 {hint}" : "Optional {hint}"}",`;
  const idx = block.indexOf(anchor);
  if (idx === -1) throw new Error(`anchor not found for locale ${localeIndex}`);
  const insertAt = idx + anchor.length;
  let chunk = "";
  for (const [key, pair] of Object.entries(BATCH)) {
    chunk += formatEntry(key, pair[localeIndex]);
  }
  return block.slice(0, insertAt) + chunk + block.slice(insertAt);
}

const path = "c:/samarket/lib/i18n/catalog/store-commerce-ui.ts";
let text = fs.readFileSync(path, "utf8");

const koStart = text.indexOf("  ko: {");
const enStart = text.indexOf("  en: {");
if (koStart === -1 || enStart === -1) throw new Error("locale blocks missing");

const koBlock = text.slice(koStart, enStart);
const enBlock = text.slice(enStart);

const newKo = injectLocale(koBlock, 0);
const newEn = injectLocale(enBlock, 1);

text = text.slice(0, koStart) + newKo + newEn;
fs.writeFileSync(path, text, "utf8");
console.log("injected", Object.keys(BATCH).length, "keys x2 locales");
