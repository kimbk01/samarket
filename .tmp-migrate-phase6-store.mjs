import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const IMPORT_LINE = 'import { useI18n } from "@/components/i18n/AppLanguageProvider";\n';

function ensureImport(content) {
  if (content.includes("useI18n")) return content;
  if (!content.includes('"use client"')) return content;
  const idx = content.indexOf("\n", content.indexOf('"use client"'));
  return content.slice(0, idx + 1) + IMPORT_LINE + content.slice(idx + 1);
}

function addHooks(content) {
  return content.replace(/export function (\w+)\([^)]*\)\s*\{/g, (match, _name, offset) => {
    const slice = content.slice(offset, offset + match.length + 80);
    if (slice.includes("useI18n()")) return match;
    return match + "\n  const { t } = useI18n();";
  });
}

/** Longer patterns first */
const REPLACEMENTS = [
  ['window.alert("링크를 복사했습니다.");', 'window.alert(t("store_link_copied"));'],
  ['window.alert("로그인 후 찜할 수 있습니다.");', 'window.alert(t("store_favorite_login_required"));'],
  ['title="주문 내용을 확인해 주세요"', 'title={t("store_checkout_confirm_title")}'],
  ['aria-label="구글 지도에서 내 위치에서 이 매장까지 길찾기"', 'aria-label={t("store_directions_google_aria")}'],
  ['aria-label="배달주소 1 (마이페이지) 선택"', 'aria-label={t("store_delivery_address_1_aria")}'],
  ['aria-label="무료배달까지 주문 금액 진행률"', 'aria-label={t("store_free_delivery_progress_aria")}'],
  ['aria-label="최소주문·배달·준비·결제 요약"', 'aria-label={t("store_commerce_summary_aria")}'],
  ['placeholder="구체적으로 적어 주시면 검토에 도움이 됩니다."', 'placeholder={t("store_report_detail_placeholder")}'],
  ['placeholder="메뉴명을 검색해보세요"', 'placeholder={t("store_menu_search_placeholder")}'],
  ['placeholder="예: 덜 맵게, 양파 빼주세요"', 'placeholder={t("store_request_placeholder")}'],
  ['placeholder="예) 국물 많이 주세요"', 'placeholder={t("store_request_placeholder_alt")}'],
  ['placeholder="픽업 시간 등"', 'placeholder={t("store_pickup_time_placeholder")}'],
  ['placeholder="매장 검색"', 'placeholder={t("store_search_placeholder")}'],
  ['aria-label="시트 닫기"', 'aria-label={t("store_sheet_close_aria")}'],
  ['aria-label="하위 업종"', 'aria-label={t("store_sub_industry_aria")}'],
  ['aria-label="대분류 업종"', 'aria-label={t("store_primary_industry_aria")}'],
  ['aria-label="대표 메뉴 이미지"', 'aria-label={t("store_featured_menu_image_aria")}'],
  ['aria-label="인기 메뉴"', 'aria-label={t("store_popular_menu_aria")}'],
  ['aria-label="추천 매장"', 'aria-label={t("store_recommended_stores_aria")}'],
  ['aria-label="주문 상태 필터"', 'aria-label={t("store_order_status_filter_aria")}'],
  ['aria-label="주문 바로가기"', 'aria-label={t("store_order_shortcuts_aria")}'],
  ['aria-label="매장 운영 메뉴"', 'aria-label={t("store_ops_menu_aria")}'],
  ['aria-label="주문 진행 단계"', 'aria-label={t("store_order_timeline_aria")}'],
  ['aria-label="주문 확인으로 이동"', 'aria-label={t("store_go_checkout_aria")}'],
  ['aria-label="장바구니 미리보기"', 'aria-label={t("store_cart_preview_aria")}'],
  ['aria-label="배달·주문 요약"', 'aria-label={t("store_delivery_order_summary_aria")}'],
  ['aria-label="리뷰 전체 보기"', 'aria-label={t("store_reviews_view_all_aria")}'],
  ['aria-label="메뉴 카테고리"', 'aria-label={t("store_menu_category_aria")}'],
  ['aria-label="주문 연락처"', 'aria-label={t("store_order_contact_aria")}'],
  ['aria-label="결제 방법"', 'aria-label={t("store_payment_method_aria")}'],
  ['aria-label="수령 방식"', 'aria-label={t("store_fulfillment_mode_aria")}'],
  ['aria-label="주문 요약"', 'aria-label={t("store_order_summary_aria")}'],
  ['aria-label="매장 정보"', 'aria-label={t("store_info_aria")}'],
  ['aria-label="메뉴 검색"', 'aria-label={t("store_menu_search_aria")}'],
  ['aria-label="수량 감소"', 'aria-label={t("store_qty_decrease_aria")}'],
  ['aria-label="수량 증가"', 'aria-label={t("store_qty_increase_aria")}'],
  ['aria-label="수량 줄이기"', 'aria-label={t("store_qty_decrease_alt_aria")}'],
  ['aria-label="수량 늘리기"', 'aria-label={t("store_qty_increase_alt_aria")}'],
  ['aria-label="친구 추가"', 'aria-label={t("store_add_friend_aria")}'],
  ['aria-label="매장으로"', 'aria-label={t("store_back_to_store_aria")}'],
  ['aria-label="뒤로가기"', 'aria-label={t("nav_back")}'],
  ['aria-label="공유"', 'aria-label={t("common_share")}'],
  ['aria-label="더보기"', 'aria-label={t("store_more_aria")}'],
  ['aria-label="검색"', 'aria-label={t("common_search")}'],
  ['aria-label="닫기"', 'aria-label={t("common_close")}'],
  ['aria-label="리뷰"', 'aria-label={t("store_reviews_title")}'],
  ['aria-label="사장님 추천"', 'aria-label={t("store_owner_pick_aria")}'],
  ['title="직선 거리"', 'title={t("store_straight_distance_title")}'],
  ['title="추천 스폿"', 'title={t("store_spot_recommended_title")}'],
  ['subtitle="에디터가 고른 동네 매장 — 카드를 옆으로 넘겨 보세요."', 'subtitle={t("store_spot_recommended_subtitle")}'],
  ['title="지금 주문 가능"', 'title={t("store_order_now_title")}'],
  ['subtitle="영업 중 · 배달 또는 포장이 열려 있어요"', 'subtitle={t("store_order_now_subtitle")}'],
  ['eyebrow="실시간"', 'eyebrow={t("store_live_eyebrow")}'],
  ['title="이 동네 더보기"', 'title={t("store_neighborhood_more_title")}'],
  ['subtitle="거리와 인기를 섞어 보여 드려요"', 'subtitle={t("store_neighborhood_more_subtitle")}'],
  ['{busy ? "접수 중…" : "주문 접수"}', '{busy ? t("store_checkout_submitting") : t("store_checkout_submit")}'],
  ['{busy ? "비우는 중…" : STORE_CART_CLEAR_CONFIRM.confirm}', '{busy ? t("store_cart_clearing") : t("store_cart_clear_confirm")}'],
  ['{replaceBusy ? "처리 중…" : STORE_CART_OTHER_STORE_CONFLICT.confirm}', '{replaceBusy ? t("store_cart_conflict_processing") : t("store_cart_replace_confirm")}'],
  ['|| "이 가게"', '|| t("store_this_store")'],
  ['|| "다른 가게"', '|| t("store_other_store")'],
  ['STORE_CART_CLEAR_CONFIRM.title', 't("store_cart_clear_title")'],
  ['STORE_CART_CLEAR_CONFIRM.body', 't("store_cart_clear_body")'],
  ['STORE_CART_CLEAR_CONFIRM.confirm', 't("store_cart_clear_confirm")'],
  ['STORE_CART_CLEAR_CONFIRM.cancel', 't("common_cancel")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.title', 't("store_cart_other_title")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.singleStoreRule', 't("store_cart_single_store_rule")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.currentCartLabel', 't("store_cart_current_label")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.pendingAddLabel', 't("store_cart_pending_label")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.listTotal', 't("store_cart_list_total")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.viewCart', 't("store_cart_view")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.cancel', 't("common_cancel")'],
  ['STORE_CART_OTHER_STORE_CONFLICT.confirm', 't("store_cart_replace_confirm")'],
  ['<span>리뷰 {store.reviewCount.toLocaleString("en-PH")}</span>', '<span>{t("store_reviews_count", { count: store.reviewCount.toLocaleString("en-PH") })}</span>'],
  [': <span>예상 {store.estPrepLabel}</span>', ': <span>{t("store_est_prep", { label: store.estPrepLabel })}</span>'],
  ['<span className={STORE_ORDER_BADGE_OPTIONAL}>선택 {rangeHint}</span>', '<span className={STORE_ORDER_BADGE_OPTIONAL}>{t("store_modifier_optional", { hint: rangeHint })}</span>'],
  ['`${line.title} 담았어요`', '`${t("store_added_to_cart_toast", { title: line.title })}`'],
  ['<span className="ml-1 font-normal text-neutral-500">· {itemCount}종</span>', '<span className="ml-1 font-normal text-neutral-500">{t("store_cart_items_kind", { count: itemCount })}</span>'],
  ['<p className={`mt-1 sam-text-xxs ${FB.metaSm}`}>다른 소유 매장 {extraCount}건 — 운영 센터에서 전환할 수 있어요.</p>', '<p className={`mt-1 sam-text-xxs ${FB.metaSm}`}>{t("store_other_owned_stores", { count: extraCount })}</p>'],
  ['return <p className="p-6 text-center text-sm text-sam-muted">불러오는 중…</p>;', 'return <p className="p-6 text-center text-sm text-sam-muted">{t("common_loading")}</p>;'],
  ['return <p className="px-4 py-8 text-center text-sm text-sam-muted">불러오는 중…</p>;', 'return <p className="px-4 py-8 text-center text-sm text-sam-muted">{t("common_loading")}</p>;'],
  ['<p className="py-16 text-center text-sm text-sam-muted">불러오는 중…</p>', '<p className="py-16 text-center text-sm text-sam-muted">{t("common_loading")}</p>'],
  ['<p className="sam-text-body-secondary text-sam-meta">불러오는 중…</p>', '<p className="sam-text-body-secondary text-sam-meta">{t("common_loading")}</p>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</motion.div>', '<motion.div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<motion.div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</motion.div>', '<motion.div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</motion.div>', '<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</div>', '<motion.div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</div>', '<motion.div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</div>', '<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</motion.div>'],
  ['<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">불러오는 중…</div>', '<div className="min-h-[40vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("common_loading")}</div>'],
  ['return <motion.div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">이동 중…</motion.div>;', 'return <motion.div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("store_navigating")}</motion.div>;'],
  ['return <div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">이동 중…</div>;', 'return <div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("store_navigating")}</motion.div>;'],
  ['return <div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">이동 중…</motion.div>;', 'return <div className="min-h-[30vh] px-4 py-12 text-center sam-text-body text-sam-muted">{t("store_navigating")}</motion.div>;'],
  ['{isOpenForOrder ? <span>영업중</span> : <span>준비중</span>}', '{isOpenForOrder ? <span>{t("store_open_now")}</span> : <span>{t("store_preparing")}</span>}'],
  ['{deliveryAvailable ? <span>배달가능</span> : null}', '{deliveryAvailable ? <span>{t("store_delivery_available")}</span> : null}'],
  ['{pickupAvailable ? <span>픽업가능</span> : null}', '{pickupAvailable ? <span>{t("store_pickup_available")}</span> : null}'],
  ['<option value="recommended">추천순</option>', '<option value="recommended">{t("store_sort_recommended")}</option>'],
  ['<option value="latest">최신순</option>', '<option value="latest">{t("store_sort_latest")}</option>'],
  ['<option value="rating_desc">별점 높은순</option>', '<option value="rating_desc">{t("store_sort_rating_high")}</option>'],
  ['<option value="rating_asc">별점 낮은순</option>', '<option value="rating_asc">{t("store_sort_rating_low")}</option>'],
  ['<StoreDetailSectionTitle level="h2">배달·주문 안내</StoreDetailSectionTitle>', '<StoreDetailSectionTitle level="h2">{t("store_delivery_order_guide_title")}</StoreDetailSectionTitle>'],
  ['<StoreDetailSectionTitle level="h2">문의</StoreDetailSectionTitle>', '<StoreDetailSectionTitle level="h2">{t("store_inquiry_title")}</StoreDetailSectionTitle>'],
  ['<StoreDetailSectionTitle level="h2">매장 정보</StoreDetailSectionTitle>', '<StoreDetailSectionTitle level="h2">{t("store_info_title")}</StoreDetailSectionTitle>'],
  ['<StoreDetailSectionTitle level="h2">리뷰</StoreDetailSectionTitle>', '<StoreDetailSectionTitle level="h2">{t("store_reviews_title")}</StoreDetailSectionTitle>'],
  ['<p className={Sam.text.bodySecondary}>리뷰 불러오는 중…</p>', '<p className={Sam.text.bodySecondary}>{t("store_reviews_loading")}</p>'],
  ['<h2 className="min-w-0 shrink text-sm font-semibold text-sam-fg">업종별 둘러보기</h2>', '<h2 className="min-w-0 shrink text-sm font-semibold text-sam-fg">{t("store_industry_grid_title")}</h2>'],
  ['<h1 className="mt-2 text-center text-xl font-bold text-sam-fg">감사합니다</h1>', '<h1 className="mt-2 text-center text-xl font-bold text-sam-fg">{t("store_order_thanks")}</h1>'],
  ['<h1 className="text-lg font-bold text-sam-fg">주문 상세</h1>', '<h1 className="text-lg font-bold text-sam-fg">{t("store_order_detail_title")}</h1>'],
  ['<h1 className="mb-3 text-[18px] font-bold text-neutral-900">리뷰</h1>', '<h1 className="mb-3 text-[18px] font-bold text-neutral-900">{t("store_reviews_title")}</h1>'],
  ['<h2 className="text-sm font-bold text-sam-fg">진행 상태</h2>', '<h2 className="text-sm font-bold text-sam-fg">{t("store_progress_status")}</h2>'],
  ['<h2 className="text-sm font-bold text-sam-fg">매장 문의 채팅</h2>', '<h2 className="text-sm font-bold text-sam-fg">{t("store_store_inquiry_chat")}</h2>'],
  ['<h2 className="text-sm font-bold text-sam-fg">주문 정보</h2>', '<h2 className="text-sm font-bold text-sam-fg">{t("store_order_info")}</h2>'],
  ['<h2 className="text-sm font-bold text-sam-fg">메뉴</h2>', '<h2 className="text-sm font-bold text-sam-fg">{t("store_menu_section")}</h2>'],
  ['<h2 className="sam-text-body font-bold text-sam-fg">내 주문</h2>', '<h2 className="sam-text-body font-bold text-sam-fg">{t("store_my_orders_title")}</h2>'],
  ['<h2 className="sam-text-body font-bold tracking-tight text-sam-fg">내 주문</h2>', '<h2 className="sam-text-body font-bold tracking-tight text-sam-fg">{t("store_my_orders_title")}</h2>'],
  ['<h2 className={FB.name}>내 주문 · 매장 운영</h2>', '<h2 className={FB.name}>{t("store_hub_my_zone_title")}</h2>'],
  ['<h2 className="truncate sam-text-body font-bold text-violet-950">매장 운영</h2>', '<h2 className="truncate sam-text-body font-bold text-violet-950">{t("store_ops_title")}</h2>'],
  [': <h2 className="truncate sam-text-body-secondary font-bold text-violet-950">매장주 바로가기</h2>', ': <h2 className="truncate sam-text-body-secondary font-bold text-violet-950">{t("store_owner_shortcut_title")}</h2>'],
  ['<h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">사장님 추천</h2>', '<h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">{t("store_owner_pick_title")}</h2>'],
  ['<h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">인기 메뉴</h2>', '<h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-neutral-900">{t("store_popular_menu_aria")}</h2>'],
  ['<h2 className="text-center sam-text-body-lg font-bold text-sam-fg">가게 정보</h2>', '<h2 className="text-center sam-text-body-lg font-bold text-sam-fg">{t("store_shop_info_title")}</h2>'],
  ['<h3 className="sam-text-body-lg font-bold text-sam-fg">소개글 및 혜택</h3>', '<h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_intro_benefits_title")}</h3>'],
  ['<h3 className="sam-text-body-lg font-bold text-sam-fg">매장 통계</h3>', '<h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_stats_title")}</h3>'],
  ['<h3 className="sam-text-body-lg font-bold text-sam-fg">전단지·소개</h3>', '<h3 className="sam-text-body-lg font-bold text-sam-fg">{t("store_flyer_intro_title")}</h3>'],
  ['<div className="text-[15px] font-bold text-neutral-900">리뷰</motion.div>', '<div className="text-[15px] font-bold text-neutral-900">{t("store_reviews_title")}</motion.div>'],
  ['<div className="text-[15px] font-bold text-neutral-900">리뷰</div>', '<div className="text-[15px] font-bold text-neutral-900">{t("store_reviews_title")}</motion.div>'],
  ['<div className="text-[15px] font-bold text-neutral-900">리뷰</div>', '<div className="text-[15px] font-bold text-neutral-900">{t("store_reviews_title")}</div>'],
  ['<p className="text-sm text-sam-muted">존재하지 않는 업종입니다.</p>', '<p className="text-sm text-sam-muted">{t("store_invalid_industry")}</p>'],
  ['<p className="py-4 text-center text-sm text-sam-muted">실매장 연동 확인 중…</p>', '<p className="py-4 text-center text-sm text-sam-muted">{t("store_verifying_live_link")}</p>'],
  ['<p className="text-sm text-sam-muted dark:text-sam-meta">표시할 매장이 없습니다.</p>', '<p className="text-sm text-sam-muted dark:text-sam-meta">{t("store_empty_store_list")}</p>'],
  ['<p className="mb-2 sam-text-xxs font-semibold text-sam-muted dark:text-sam-meta">다른 업종 둘러보기</p>', '<p className="mb-2 sam-text-xxs font-semibold text-sam-muted dark:text-sam-meta">{t("store_browse_other_industries")}</p>'],
  ['<p className="text-sm text-sam-muted">주문 정보를 불러오지 못했거나 주문 번호가 없습니다.</p>', '<p className="text-sm text-sam-muted">{t("store_order_load_failed")}</p>'],
  ['<p className="text-sm text-sam-muted">주문을 찾을 수 없거나 올바른 주문 번호가 아닙니다.</p>', '<p className="text-sm text-sam-muted">{t("store_order_not_found")}</p>'],
  ['<p className="text-[12px] text-neutral-500">리뷰 요약을 불러오지 못했어요.</p>', '<p className="text-[12px] text-neutral-500">{t("store_review_summary_load_failed")}</p>'],
  ['<p className="py-10 text-center text-[14px] text-neutral-500">담긴 메뉴가 없어요</p>', '<p className="py-10 text-center text-[14px] text-neutral-500">{t("store_cart_preview_empty")}</p>'],
  ['<p className="px-2.5 py-3 text-center text-[12px] text-neutral-500">담긴 메뉴 없음</p>', '<p className="px-2.5 py-3 text-center text-[12px] text-neutral-500">{t("store_cart_preview_none")}</p>'],
  ['<p className="font-medium">담아 둔 장바구니가 있으면 아래에서 열 수 있어요.</p>', '<p className="font-medium">{t("store_cart_saved_hint")}</p>'],
  ['<p className="sam-text-xxs font-semibold text-sam-muted">현재 카트</p>', '<p className="sam-text-xxs font-semibold text-sam-muted">{t("store_current_cart")}</p>'],
  ['<p className="sam-text-body-lg font-semibold text-emerald-800">주문이 접수되었습니다.</p>', '<p className="sam-text-body-lg font-semibold text-emerald-800">{t("store_order_accepted")}</p>'],
  ['<p className="sam-text-body-lg font-semibold text-sam-fg">장바구니가 비어 있어요</p>', '<p className="sam-text-body-lg font-semibold text-sam-fg">{t("store_cart_empty")}</p>'],
  ['<p className="mt-1 sam-text-body text-sam-muted">먹고 싶은 가게를 찾아보세요</p>', '<p className="mt-1 sam-text-body text-sam-muted">{t("store_cart_empty_hint")}</p>'],
  ['<p className="sam-text-body font-medium text-sam-muted">수령 방식</p>', '<p className="sam-text-body font-medium text-sam-muted">{t("store_fulfillment_mode")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sky-950">픽업 장소 (매장 주소)</p>', '<p className="sam-text-helper font-semibold text-sky-950">{t("store_pickup_location")}</p>'],
  ['<p className="sam-text-helper text-sam-muted">배달 주소 정보를 불러오는 중입니다…</p>', '<p className="sam-text-helper text-sam-muted">{t("store_delivery_address_loading")}</p>'],
  ['<p className="sam-text-body-secondary font-bold text-sam-fg">배달주소 1</p>', '<p className="sam-text-body-secondary font-bold text-sam-fg">{t("store_delivery_address_1")}</p>'],
  ['<p className="font-medium">신고가 접수되었습니다.</p>', '<p className="font-medium">{t("store_report_submitted")}</p>'],
  ['<p className="mt-1 sam-text-body-secondary text-sam-success">검토 후 필요 시 조치합니다. 허위 신고는 제재 대상이 될 수 있습니다.</p>', '<p className="mt-1 sam-text-body-secondary text-sam-success">{t("store_report_followup")}</p>'],
  ['<p className="mt-3 sam-text-body text-sam-meta">등록된 소개글이 없습니다.</p>', '<p className="mt-3 sam-text-body text-sam-meta">{t("store_no_intro")}</p>'],
  ['<p className={`${Sam.text.body} text-sam-muted`}>아직 등록된 리뷰가 없습니다.</p>', '<p className={`${Sam.text.body} text-sam-muted`}>{t("store_no_reviews_yet")}</p>'],
  ['<p className={`${Sam.text.body} text-sam-muted`}>조건에 맞는 리뷰가 없습니다.</p>', '<p className={`${Sam.text.body} text-sam-muted`}>{t("store_no_matching_reviews")}</p>'],
  ['<p className={`font-semibold text-sam-fg ${Sam.text.helper}`}>사장님 댓글</p>', '<p className={`font-semibold text-sam-fg ${Sam.text.helper}`}>{t("store_owner_reply")}</p>'],
  ['<p className="text-sm text-sam-muted">잘못된 주소입니다.</p>', '<p className="text-sm text-sam-muted">{t("store_invalid_address")}</p>'],
  ['<p className="mt-1 px-4 text-[11px] text-amber-800">옵션을 올바르게 선택해 주세요.</p>', '<p className="mt-1 px-4 text-[11px] text-amber-800">{t("store_fix_modifier_selection")}</p>'],
  ['<p className="font-semibold text-sam-fg">선택한 옵션</p>', '<p className="font-semibold text-sam-fg">{t("store_selected_options")}</p>'],
  ['<p className="mt-2 text-xs text-amber-800">필수 옵션을 확인해 주세요.</p>', '<p className="mt-2 text-xs text-amber-800">{t("store_required_options_hint")}</p>'],
  ['<p className={FB.body}>등록된 매장이 없습니다</p>', '<p className={FB.body}>{t("store_no_registered_stores")}</p>'],
  ['<p className={`sam-text-helper ${FB.metaSm}`}>내 매장 상태 확인 중…</p>', '<p className={`sam-text-helper ${FB.metaSm}`}>{t("store_my_store_status_loading")}</p>'],
  ['<p className={`sam-text-xxs font-semibold uppercase tracking-wide ${FB.metaSm}`}>내 매장</p>', '<p className={`sam-text-xxs font-semibold uppercase tracking-wide ${FB.metaSm}`}>{t("store_my_store_label")}</p>'],
  ['<p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>피드</p>', '<p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>{t("store_feed_eyebrow")}</p>'],
  ['<p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>한눈에</p>', '<p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>{t("store_promo_eyebrow")}</p>'],
  ['<p className={`mt-1 ${FB.name}`}>업종 골라 바로 들어가기</p>', '<p className={`mt-1 ${FB.name}`}>{t("store_promo_title")}</p>'],
  ['<p className={`mt-1 ${FB.meta}`}>식당·마트·생활까지 탭만 바꾸면 세부가 바뀌어요.</p>', '<p className={`mt-1 ${FB.meta}`}>{t("store_promo_subtitle")}</p>'],
  ['<p className="mb-1.5 px-0.5 sam-text-xxs font-semibold uppercase tracking-wide text-sam-meta">상태</p>', '<p className="mb-1.5 px-0.5 sam-text-xxs font-semibold uppercase tracking-wide text-sam-meta">{t("store_status_label")}</p>'],
  ['<p className="px-3 pb-2 sam-text-xxs text-amber-700">품절</p>', '<p className="px-3 pb-2 sam-text-xxs text-amber-700">{t("store_sold_out")}</p>'],
  ['<p className="mt-0.5 sam-text-xxs text-amber-700">품절 · 선택 불가</p>', '<p className="mt-0.5 sam-text-xxs text-amber-700">{t("store_sold_out_cannot_select")}</p>'],
  ['<p className="sam-text-xxs font-medium text-sam-muted">평점</p>', '<p className="sam-text-xxs font-medium text-sam-muted">{t("store_rating_label")}</p>'],
  ['<p className="sam-text-xxs font-medium text-sam-muted">리뷰</p>', '<p className="sam-text-xxs font-medium text-sam-muted">{t("store_reviews_title")}</p>'],
  ['<p className="sam-text-xxs font-medium text-sam-muted">찜</p>', '<p className="sam-text-xxs font-medium text-sam-muted">{t("store_favorites_label")}</p>'],
  ['<p className="sam-text-xxs font-medium text-sam-muted">최근 주문</p>', '<p className="sam-text-xxs font-medium text-sam-muted">{t("store_recent_orders")}</p>'],
  ['<p className="sam-text-helper font-semibold text-sam-muted">이용 가능</p>', '<p className="sam-text-helper font-semibold text-sam-muted">{t("store_available")}</p>'],
  ['<p className="sam-text-body font-medium text-sam-fg">장바구니가 비어 있어요.</p>', '<p className="sam-text-body font-medium text-sam-fg">{t("store_cart_empty_period")}</p>'],
  ['<p className="mt-1 sam-text-body text-sam-muted">매장 상세에서 메뉴를 담아 주세요.</p>', '<p className="mt-1 sam-text-body text-sam-muted">{t("store_cart_empty_add_menu")}</p>'],
  ['<p className="text-xs font-medium text-sam-muted">수량</p>', '<p className="text-xs font-medium text-sam-muted">{t("store_quantity")}</p>'],
  ['<dt className="font-semibold text-neutral-500">연락처</dt>', '<dt className="font-semibold text-neutral-500">{t("store_label_contact")}</dt>'],
  ['<dt className="font-semibold text-neutral-500">주소</dt>', '<dt className="font-semibold text-neutral-500">{t("store_label_address")}</dt>'],
  ['<dt className="font-semibold text-neutral-500">결제</dt>', '<dt className="font-semibold text-neutral-500">{t("store_label_payment")}</dt>'],
  ['<dt className="text-sam-muted">주문번호</dt>', '<dt className="text-sam-muted">{t("store_order_number")}</dt>'],
  ['<dt className="text-sam-muted">업체</dt>', '<dt className="text-sam-muted">{t("store_order_vendor")}</dt>'],
  ['<dt className="text-sam-muted">주문 금액</dt>', '<dt className="text-sam-muted">{t("store_order_amount")}</dt>'],
  ['<dt className="text-sam-muted">요청</dt>', '<dt className="text-sam-muted">{t("store_request_label")}</dt>'],
  ['<dt className="text-sam-muted">연락처</dt>', '<dt className="text-sam-muted">{t("store_label_contact")}</dt>'],
  ['<dt className="text-sam-muted">최소주문</dt>', '<dt className="text-sam-muted">{t("store_min_order_short")}</dt>'],
  ['<dt className="text-sam-muted">배달비</dt>', '<dt className="text-sam-muted">{t("store_delivery_fee")}</dt>'],
  ['<dt className="text-sam-muted">예상 조리</dt>', '<dt className="text-sam-muted">{t("store_est_prep_short")}</dt>'],
  ['<dt className="text-sam-muted">지역</dt>', '<dt className="text-sam-muted">{t("store_region_label")}</dt>'],
  ['<dt className="text-sam-muted">총상품금액</dt>', '<dt className="text-sam-muted">{t("store_items_subtotal")}</dt>'],
  ['<dt className="text-sam-muted">예상배달비</dt>', '<dt className="text-sam-muted">{t("store_estimated_delivery_fee")}</dt>'],
  ['<dt>최소 주문</dt>', '<dt>{t("store_min_order")}</dt>'],
  ['<dt>현재 상품 금액</dt>', '<dt>{t("store_current_items_total")}</dt>'],
  ['<dt>부족한 금액</dt>', '<dt>{t("store_shortfall_amount")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">영업시간</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_weekday")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">토 영업시간</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_saturday")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">일 영업시간</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_hours_sunday")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">휴무일</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_closed_days")}</dt>'],
  ['<dt className="w-full sam-text-body-secondary text-sam-meta sm:w-[100px] sm:shrink-0">전화번호</dt>', '<dt className="w-full sam-text-body-secondary text-sam-meta sm:w-[100px] sm:shrink-0">{t("store_phone_number")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">위치</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_location")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달·픽업</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_pickup")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달 시간</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_time")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">결제</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_label_payment")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">최소주문</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_min_order_short")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">배달비(안내)</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_delivery_fee_notice")}</dt>'],
  ['<dt className="sam-text-body-secondary text-sam-meta">배달·지역 안내</dt>', '<dt className="sam-text-body-secondary text-sam-meta">{t("store_delivery_region_guide")}</dt>'],
  ['<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">등록·수정</dt>', '<dt className="w-[100px] shrink-0 pt-0.5 sam-text-body-secondary text-sam-meta">{t("store_registered_updated")}</dt>'],
  ['<dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">주문수</dt>', '<dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">{t("store_order_count_label")}</dt>'],
  ['<dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">리뷰수</dt>', '<dt className="w-[100px] shrink-0 sam-text-body-secondary text-sam-meta">{t("store_review_count_label")}</dt>'],
  ['<span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">동네</span>', '<span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">{t("store_neighborhood")}</span>'],
  ['<span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">지역</span>', '<span className="w-11 shrink-0 sam-text-body-secondary text-sam-meta">{t("store_region_label")}</span>'],
  ['<span className="text-sam-muted">상품</span>', '<span className="text-sam-muted">{t("store_product_label")}</span>'],
  ['<span className="text-sam-muted">배달비</span>', '<span className="text-sam-muted">{t("store_delivery_fee")}</span>'],
  ['<span>합계</span>', '<span>{t("store_total")}</span>'],
  ['<span className="text-sam-muted">상품 금액</span>', '<span className="text-sam-muted">{t("store_product_amount")}</span>'],
  ['<span>주문 예정 금액</span>', '<span>{t("store_planned_order_total")}</span>'],
  ['<span className="font-normal text-sam-meta"> (선택)</span>', '<span className="font-normal text-sam-meta">{t("store_optional_suffix")}</span>'],
  ['<span className="ml-1 font-normal text-sam-muted">매장 입력·조리 안내 기준</span>', '<span className="ml-1 font-normal text-sam-muted">{t("store_prep_time_store_basis")}</span>'],
  ['<span className="ml-1 font-normal text-sam-muted">오토바이 경로 기준</span>', '<span className="ml-1 font-normal text-sam-muted">{t("store_route_motorcycle_basis")}</span>'],
  ['<span className="ml-1 sam-text-helper font-normal text-sam-muted">(최근 90일)</span>', '<span className="ml-1 sam-text-helper font-normal text-sam-muted">{t("store_recent_90_days")}</span>'],
  ['<span className="mt-0.5 block sam-text-helper font-normal text-white/75">주소 · 영업 · 안내</span>', '<span className="mt-0.5 block sam-text-helper font-normal text-white/75">{t("store_info_card_sub")}</span>'],
  ['<span className="text-sam-muted dark:text-[#B0B3B8]"> · 세부 주제</span>', '<span className="text-sam-muted dark:text-[#B0B3B8]">{t("store_subtopic_suffix")}</span>'],
  ['<span className="sam-text-xxs font-semibold leading-none text-sam-muted dark:text-[#B0B3B8]">모아보기</span>', '<span className="sam-text-xxs font-semibold leading-none text-sam-muted dark:text-[#B0B3B8]">{t("store_collect_view")}</span>'],
  ['<span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">더보기</span>', '<span className="text-[13px] font-semibold leading-none text-[#111]/70 dark:text-white/70">{t("store_show_more")}</span>'],
  ['<span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">결제</span> ·{" "}', '<span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">{t("store_label_payment")}</span> ·{" "}'],
  ['<span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">결제</span> · {store.paymentMethodsLine}', '<span className="font-semibold text-[#4B5563] dark:text-[#B8C0CA]">{t("store_label_payment")}</span> · {store.paymentMethodsLine}'],
  ['<span className="font-semibold text-[#2563EB]">배달비 무료 적용 중</span>', '<span className="font-semibold text-[#2563EB]">{t("store_free_delivery_applied")}</span>'],
  ['<span className="font-bold text-[#2563EB]">배달비 무료 적용 중</span>', '<span className="font-bold text-[#2563EB]">{t("store_free_delivery_applied")}</span>'],
  ['<span className="text-[13px] font-semibold text-[#2563EB]">배달비 무료 적용 중</span>', '<span className="text-[13px] font-semibold text-[#2563EB]">{t("store_free_delivery_applied")}</span>'],
  ['<span className="font-semibold text-[#2563EB] dark:text-[#8AB4FF]">배달비 무료 적용 중</span>', '<span className="font-semibold text-[#2563EB] dark:text-[#8AB4FF]">{t("store_free_delivery_applied")}</span>'],
  ['<span className="sam-text-body font-bold text-sam-fg">결제예정금액</span>', '<span className="sam-text-body font-bold text-sam-fg">{t("store_payment_due")}</span>'],
  ['<span className="font-medium text-sam-fg">배달 안내</span> · {courier}', '<span className="font-medium text-sam-fg">{t("store_delivery_guide")}</span> · {courier}'],
  ['<span className="font-semibold text-sam-fg">배달 담당(착불)</span> · {commerceExtras.deliveryCourierLabel}', '<span className="font-semibold text-sam-fg">{t("store_courier_cod")}</span> · {commerceExtras.deliveryCourierLabel}'],
  ['<span className="font-semibold text-sam-fg">배달 안내</span>', '<span className="font-semibold text-sam-fg">{t("store_delivery_guide")}</span>'],
  ['<span className={disabled}>전화 문의</span>', '<span className={disabled}>{t("store_phone_inquiry")}</span>'],
  ['<span className="sam-text-xxs font-medium text-sam-muted">진행 중</span>', '<span className="sam-text-xxs font-medium text-sam-muted">{t("store_in_progress")}</span>'],
  ['<span className="mt-2 sam-text-xxs font-semibold text-signature">내역</span>', '<span className="mt-2 sam-text-xxs font-semibold text-signature">{t("store_history")}</span>'],
  ['<span className="sam-text-xxs font-medium text-sam-muted">주문 채팅</span>', '<span className="sam-text-xxs font-medium text-sam-muted">{t("store_order_chat")}</span>'],
  ['<span className="sam-text-xxs font-medium text-sam-muted">최근</span>', '<span className="sam-text-xxs font-medium text-sam-muted">{t("store_recent")}</span>'],
  ['<span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">상세</span>', '<span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">{t("store_detail_link")}</span>'],
  ['<span className="mt-2 sam-text-helper text-sam-muted">주문 없음</span>', '<span className="mt-2 sam-text-helper text-sam-muted">{t("store_no_orders")}</span>'],
  ['<span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">업종 찾기</span>', '<span className="mt-auto pt-2 sam-text-xxs font-semibold text-signature">{t("store_find_industry")}</span>'],
  ['<span className={`mt-2 inline-block sam-text-body ${FB.link}`}>업종 열기</span>', '<span className={`mt-2 inline-block sam-text-body ${FB.link}`}>{t("store_open_industries")}</span>'],
  ['<span className="sam-text-xxs font-medium text-emerald-700 dark:text-emerald-300">/stores 노출</span>', '<span className="sam-text-xxs font-medium text-emerald-700 dark:text-emerald-300">{t("store_listed_on_stores")}</span>'],
  ['<span className="ml-1.5 text-[11px] font-semibold text-neutral-400">품절</span>', '<span className="ml-1.5 text-[11px] font-semibold text-neutral-400">{t("store_sold_out")}</span>'],
  ['<span className={STORE_ORDER_BADGE_REQUIRED}>필수</span>', '<span className={STORE_ORDER_BADGE_REQUIRED}>{t("store_modifier_required")}</span>'],
  ['<span className="sam-text-xxs font-medium text-amber-700">품절</span>', '<span className="sam-text-xxs font-medium text-amber-700">{t("store_sold_out")}</span>'],
  ['<span className="text-neutral-600">총금액</span>', '<span className="text-neutral-600">{t("store_cart_total")}</span>'],
  ['<span className="text-[12px] font-medium text-neutral-500">메뉴</span>', '<span className="text-[12px] font-medium text-neutral-500">{t("store_menu_label")}</span>'],
  ['<span className="text-neutral-500">옵션 추가</span>', '<span className="text-neutral-500">{t("store_add_options")}</span>'],
  ['<span className="text-[12px] font-bold text-neutral-800">1개당</span>', '<span className="text-[12px] font-bold text-neutral-800">{t("store_per_item")}</span>'],
  ['<span className="pt-0.5 text-[12px] font-medium text-neutral-500">메뉴 금액</span>', '<span className="pt-0.5 text-[12px] font-medium text-neutral-500">{t("store_menu_amount")}</span>'],
  ['<span className="ml-0.5 text-[11px] font-semibold text-neutral-500">/개</span>', '<span className="ml-0.5 text-[11px] font-semibold text-neutral-500">{t("store_per_unit_suffix")}</span>'],
  ['<span className="text-[13px] font-bold text-neutral-900">수량</span>', '<span className="text-[13px] font-bold text-neutral-900">{t("store_quantity")}</span>'],
  ['<span className="text-[12px] font-semibold text-neutral-600">주문 합계</span>', '<span className="text-[12px] font-semibold text-neutral-600">{t("store_order_total")}</span>'],
  ['<span className="shrink-0 sam-text-helper font-bold tracking-tight text-sam-muted">공지</span>', '<span className="shrink-0 sam-text-helper font-bold tracking-tight text-sam-muted">{t("store_notice_label")}</span>'],
  ['<span className="sam-form-label">사유</span>', '<span className="sam-form-label">{t("store_report_reason")}</span>'],
  ['<span className="sam-form-label">상세 내용 (최대 2000자)</span>', '<span className="sam-form-label">{t("store_report_detail_label")}</span>'],
  ['<span>배달비 매장별</span>', '<span>{t("store_delivery_fee_per_store")}</span>'],
  ['요청사항 <span className="font-medium text-neutral-500">(선택)</span>', '{t("store_request_note")} <span className="font-medium text-neutral-500">{t("store_optional_suffix")}</span>'],
  ['            취소\n', '            {t("common_cancel")}\n'],
  ['매장에 등록된 영업·결제·공지입니다. 주소·지도는 우측 <strong className="text-sam-muted">가게 정보</strong>', '{t("store_commerce_notice_html")}'],
];

const EXTRA_FILES = [
  "components/stores/cart/StoreCartClearConfirmDialog.tsx",
  "components/stores/cart/StoreCartConflictPortal.tsx",
  "components/stores/cart/StoreCommerceCartBottomSheet.tsx",
];

function patchFile(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn("skip missing", rel);
    return false;
  }
  let content = fs.readFileSync(fp, "utf8");
  const before = content;
  if (!content.includes('"use client"')) {
    console.log("skip non-client", rel);
    return false;
  }
  content = ensureImport(content);
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to);
  }
  content = addHooks(content);
  if (content !== before) {
    fs.writeFileSync(fp, content);
    console.log("patched", rel);
    return true;
  }
  console.log("unchanged", rel);
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "owner") continue;
      walk(p, out);
    } else if (e.name.endsWith(".tsx")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

const files = [...new Set([...walk("components/stores"), ...EXTRA_FILES])];
let n = 0;
for (const rel of files) {
  if (patchFile(rel)) n++;
}
console.log("patched count", n);
