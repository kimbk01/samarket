import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILE_REPLACEMENTS = {
  "components/favorites/FavoriteProductsView.tsx": [
    ['/** 서버 세션 {t("common_none")} → {t("common_login")} 화면 (머물러 있던 탭에서도 동일) */', '/** 서버 세션 없음 → 로그인 화면 */'],
    ['{t("common_login")} 화면으로 이동합니다...', '{t("ui_fav_redirect_login")}'],
    ['<p className="text-[14px] text-sam-muted">찜한 상품이 없어요</p>', '<p className="text-[14px] text-sam-muted">{t("ui_fav_empty_title")}</p>'],
    ['홈이나 상품 상세에서 하트를 눌러 관심 상품을 담아 보세요.', '{t("ui_fav_empty_hint")}'],
    ['홈으로 가기', '{t("ui_fav_go_home")}'],
    [
      `  const emptyTabMsg: Record<FavoriteManageTabId, string> = {
    all: "표시할 찜이 없어요.",
    active: "판매 중인 찜 상품이 없어요.",
    sold: "거래가 끝난 찜 상품이 없어요.",
    gone: "품절·{t("common_delete")}된 찜 상품이 없어요.",
  };`,
      `  const emptyTabMsg = useMemo(
    (): Record<FavoriteManageTabId, string> => ({
      all: t("ui_fav_tab_empty_all"),
      active: t("ui_fav_tab_empty_active"),
      sold: t("ui_fav_tab_empty_sold"),
      gone: t("ui_fav_tab_empty_gone"),
    }),
    [t]
  );`,
    ],
  ],
  "components/favorites/FavoritePostTradeActions.tsx": [
    ['post.type !== "community" && existingRoomId ? "채팅 이어가기" : "채팅하기";', 'post.type !== "community" && existingRoomId ? t("ui_fav_chat_continue") : t("member_order_chat_action");'],
    ['setChatError("다른 분과 예약이 진행 중인 상품입니다.");', 'setChatError(t("ui_fav_err_reserved_other"));'],
    ['setChatError("거래가 완료된 상품은 새 채팅을 열 수 없습니다.");', 'setChatError(t("ui_fav_err_sold_no_chat"));'],
    ['(post.title ?? "상품").trim()', '(post.title ?? t("post_preview_product_default")).trim()'],
    ['? "무료나눔"', '? t("post_preview_free_share")'],
    [': "가격 문의";', ': t("post_preview_price_inquiry");'],
    [': "판매자";', ': t("ui_fav_seller_fallback");'],
    ['? "다른 구매자와 예약이 진행 중입니다"', '? t("ui_fav_reserved_other_title")'],
    ['판매자 정보', '{t("ui_fav_seller_info")}'],
  ],
  "components/favorites/FavoriteToggleButton.tsx": [
    ['aria-label={liked ? "관심 해제" : "관심"}', 'aria-label={liked ? t("ui_fav_interest_remove_aria") : t("ui_fav_interest_add_aria")}'],
    ['{showLabel && <span>관심</span>}', '{showLabel && <span>{t("ui_fav_interest")}</span>}'],
  ],
  "components/favorites/PostFavoriteButton.tsx": [
    ['aria-label={displayFavorited ? "관심 해제" : "관심"}', 'aria-label={displayFavorited ? t("store_favorite_remove_aria") : t("store_favorite_add_aria")}'],
    [' * - 목록: `favorited` prop만 하트에 반영. API 성공 후에만 `onFavoriteChange` 호출(낙관적 업데이트 {t("common_none")} — 언마운트/맵 꼬임 방지).', ' * - 목록: `favorited` prop만 하트에 반영. API 성공 후에만 `onFavoriteChange` 호출(낙관적 업데이트 없음 — 언마운트/맵 꼬임 방지).'],
  ],
  "components/favorites/FavoriteProductCard.tsx": [
    ['끌올', '{t("mypage_comp_product_bump")}'],
  ],
  "components/product/ProductCard.tsx": [
    ['끌올', '{t("mypage_comp_product_bump")}'],
    ['관심 {product.likesCount}', '{t("ui_product_interest_count", { count: product.likesCount })}'],
  ],
  "components/product/form/ProductConditionSelect.tsx": [
    ['상품 상태', '{t("ui_product_condition_label")}'],
  ],
  "components/product/form/ProductPriceField.tsx": [
    ['가격 <span', '{t("ui_product_price_label")} <span'],
    ['가격 제안 가능', '{t("ui_product_price_offer_enabled")}'],
  ],
  "components/product/form/ProductImagePicker.tsx": [
    ['사진', '{t("ui_product_photos_label")}'],
    ['aria-label="{t("common_delete")}"', 'aria-label={t("common_delete")}'],
  ],
  "components/product/form/ProductCategorySelect.tsx": [
    ['카테고리 <span', '{t("ui_product_category_label")} <span'],
    ['<option value="">선택</option>', '<option value="">{t("ui_product_category_select")}</option>'],
  ],
  "components/product/form/ProductLocationSelect.tsx": [
    ['거래 지역 <span', '{t("ui_product_trade_region_label")} <span'],
  ],
  "components/product/form/ProductForm.tsx": [
    ['next.title = "제목을 입력해 주세요."', 'next.title = t("ui_product_err_title")'],
    ['next.description = "설명을 입력해 주세요."', 'next.description = t("ui_product_err_desc")'],
    ['next.price = "가격을 입력해 주세요."', 'next.price = t("ui_product_err_price")'],
    ['next.category = "카테고리를 선택해 주세요."', 'next.category = t("ui_product_err_category")'],
    ['next.region = "거래 지역과 동네를 선택해 주세요."', 'next.region = t("ui_product_err_region")'],
    ['제목 <span', '{t("ui_product_title_label")} <span'],
    ['placeholder="상품 제목"', 'placeholder={t("ui_product_title_placeholder")}'],
    ['설명 <span', '{t("ui_product_desc_label")} <span'],
    ['placeholder="상품 설명"', 'placeholder={t("ui_product_desc_placeholder")}'],
    ['{submitting ? "등록 중…" : "등록하기"}', '{submitting ? t("ui_product_registering") : t("ui_product_register")}'],
  ],
  "components/product/detail/ProductImageGallery.tsx": [
    ['이미지', '{t("ui_product_gallery_fallback")}'],
    ['aria-label="이전 이미지"', 'aria-label={t("ui_product_gallery_prev_aria")}'],
    ['aria-label="다음 이미지"', 'aria-label={t("ui_product_gallery_next_aria")}'],
  ],
  "components/product/detail/ProductDetailHeaderToolbar.tsx": [
    ['document.title || "상품"', 'document.title || t("post_preview_product_default")'],
    ['aria-label="공유"', 'aria-label={t("ui_product_share_aria")}'],
    ['aria-label="더보기"', 'aria-label={t("ui_product_more_aria")}'],
    ['상품 신고', '{t("store_report_product")}'],
  ],
  "components/product/SellerListingStateControl.tsx": [
    ['aria-label="거래 상태"', 'aria-label={t("ui_product_listing_status_aria")}'],
  ],
  "components/products/ProductTradeEditPageClient.tsx": [
    ['setErrorMessage("네트워크 오류가 났습니다.");', 'setErrorMessage(t("common_network_error"));'],
    ['res.status === 401 ? "로그인이 필요합니다." : null', 'res.status === 401 ? t("common_login_required") : null'],
    ['setErrorMessage(err || "지금은 수정할 수 없는 상태입니다.");', 'setErrorMessage(err || t("ui_product_edit_cannot_edit"));'],
    ['setErrorMessage(err || "불러오지 못했습니다.");', 'setErrorMessage(err || t("ui_product_edit_load_failed"));'],
    ['setErrorMessage("글 정보를 받지 못했습니다.");', 'setErrorMessage(t("ui_product_edit_no_payload"));'],
    ['setErrorMessage("카테고리를 찾을 수 없습니다.");', 'setErrorMessage(t("trade_120"));'],
    ['이 카테고리에는 글을 쓸 수 없습니다.', '{t("trade_098")}'],
    ['상품으로 돌아가기', '{t("ui_product_edit_back_to_product")}'],
    ['카테고리 정보를 불러오는 중입니다.', '{t("trade_119")}'],
    ['이 상품은 이 화면에서 수정할 수 없습니다.', '{t("ui_product_edit_cannot_edit")}'],
    ['상품으로', '{t("ui_product_edit_back_short")}'],
  ],
  "components/category/CategoryListSubheader.tsx": [
    ['불러오는 중…', '{t("common_loading")}'],
  ],
  "components/category/CategoryListLayout.tsx": [
    ['불러오는 중…', '{t("common_loading")}'],
    ['카테고리를 찾을 수 없습니다.', '{t("ui_category_not_found")}'],
  ],
  "components/category/CategoryEmptyState.tsx": [
    ['const DEFAULT_MESSAGE = "아직 글이 없어요.";', ''],
    ['const DEFAULT_SUB = "첫 글을 올려보세요.";', ''],
    ['message = DEFAULT_MESSAGE,', ''],
    ['subMessage = DEFAULT_SUB,', ''],
    ['}: CategoryEmptyStateProps) {', '}: CategoryEmptyStateProps) {\n  const { t } = useI18n();'],
    ['{message}', '{message ?? t("ui_category_empty_message")}'],
    ['{subMessage}', '{subMessage ?? t("ui_category_empty_sub")}'],
  ],
  "components/market/JobListingKindTabs.tsx": [
    ['const tabs: { kind: JobListingKindTab; label: string }[] = [', 'const tabs: { kind: JobListingKindTab; labelKey: "jobs_listing_hire" | "jobs_listing_work_short" }[] = ['],
    ['{ kind: "hire", label: "사람 구해요" }', '{ kind: "hire", labelKey: "jobs_listing_hire" }'],
    ['{ kind: "work", label: "일 찾고 있어요" }', '{ kind: "work", labelKey: "jobs_listing_work_short" }'],
    ['aria-label="구인구직 유형"', 'aria-label={t("ui_market_jobs_tab_aria")}'],
    ['tabs.map(({ kind, label }) => {', 'tabs.map(({ kind, labelKey }) => {'],
    ['{label}', '{t(labelKey)}'],
  ],
  "components/market/MarketCategoryFeed.tsx": [
    ['aria-label="주제 필터"', 'aria-label={t("ui_market_topic_filter_aria")}'],
  ],
  "components/reports/ReportReasonSelector.tsx": [
    ['신고 사유', '{t("ui_report_reason_title")}'],
  ],
  "components/reports/ReportActionSheet.tsx": [
    ['setError(res.error ?? "신고 접수에 실패했습니다.");', 'setError(res.error ?? t("ui_report_failed"));'],
    ['이미 신고한 대상입니다.', '{t("ui_report_already")}'],
    ['신고 사유를 선택해 주세요.', '{t("ui_report_select_prompt")}'],
    ['기타 사유 (선택)', '{t("ui_report_other_optional")}'],
    ['placeholder="구체적으로 적어 주세요"', 'placeholder={t("ui_report_detail_placeholder")}'],
    ['{submitting ? "접수 중…" : "신고하기"}', '{submitting ? t("ui_report_submitting") : t("ui_report_submit")}'],
  ],
  "components/reports/BlockedUserList.tsx": [
    ['차단한 사용자가 없어요', '{t("ui_report_blocked_empty")}'],
  ],
  "components/reports/UserBlockButton.tsx": [
    ['if (confirm(`${nickname ?? "이 사용자"}를 차단할까요?`)) {', 'if (confirm(t("ui_report_block_user_confirm", { nickname: nickname ?? t("ui_report_user_fallback", { id: "" }) }))) {'],
    ['const label = blocked ? "차단 해제" : "차단";', 'const label = blocked ? t("ui_report_unblock") : t("ui_report_block");'],
  ],
  "components/reports/BlockedUserCard.tsx": [
    ['if (confirm("차단을 해제할까요?")) {', 'if (confirm(t("ui_report_unblock_confirm"))) {'],
    ['`사용자 ${blocked.blockedUserId}`', 't("ui_report_user_fallback", { id: blocked.blockedUserId })'],
    ['차단된 사용자', '{t("ui_report_blocked_user_label")}'],
    ['차단 해제', '{t("ui_report_unblock")}'],
  ],
  "components/reports/BlockActionSheet.tsx": [
    ['if (!confirm(`"${targetLabel}"님을 차단하면 서로 채팅을 보낼 수 없습니다. 차단할까요?`)) return;', 'if (!confirm(t("ui_report_block_chat_confirm", { label: targetLabel }))) return;'],
    ['setError(d?.error ?? "채팅방 차단 반영에 실패했습니다.");', 'setError(d?.error ?? t("ui_report_room_block_failed"));'],
    ['setError((e as Error)?.message ?? "채팅방 차단 반영에 실패했습니다.");', 'setError((e as Error)?.message ?? t("ui_report_room_block_failed"));'],
    ['{targetLabel}님을 차단하면 서로의 메시지 전송이 불가하며, 기존 대화는 보관됩니다.', '{t("ui_report_block_chat_desc", { label: targetLabel })}'],
    ['{loading ? "처리 중..." : "차단하기"}', '{loading ? t("ui_report_block_submitting") : t("ui_report_block_action")}'],
  ],
  "components/recent-viewed/RecentViewedList.tsx": [
    ['최근 본 상품이 없어요', '{t("ui_recent_empty")}'],
  ],
  "components/recent-viewed/RecentViewedCard.tsx": [
    [`const SOURCE_LABEL: Record<string, string> = {
  home: "홈",
  search: "검색",
  chat: "채팅",
  recommendation: "추천",
  shop: "상점",
};`, `const SOURCE_LABEL_KEY: Record<string, "ui_recent_source_home" | "ui_recent_source_search" | "ui_recent_source_chat" | "ui_recent_source_recommendation" | "ui_recent_source_shop"> = {
  home: "ui_recent_source_home",
  search: "ui_recent_source_search",
  chat: "ui_recent_source_chat",
  recommendation: "ui_recent_source_recommendation",
  shop: "ui_recent_source_shop",
};`],
    ['SOURCE_LABEL[item.source]', 't(SOURCE_LABEL_KEY[item.source] ?? "ui_recent_source_home")'],
  ],
  "components/regions/SavedRegionCard.tsx": [
    ['현재 보는 동네', '{t("ui_region_current_neighborhood")}'],
    ['대표로', '{t("ui_region_set_primary")}'],
    ['삭제', '{t("ui_region_remove")}'],
  ],
  "components/regions/RegionSelectorForm.tsx": [
    ['지역', '{t("ui_region_label")}'],
    ['바랑가이 (선택)', '{t("ui_region_barangay_optional")}'],
    ['대표 동네로 설정', '{t("ui_region_set_primary_checkbox")}'],
  ],
  "components/regions/PrimaryRegionBadge.tsx": [
    ['대표', '{t("ui_region_primary_badge")}'],
  ],
  "components/regions/MyRegionSettingsView.tsx": [
    ['등록된 동네가 없어요. 동네를 추가하면 해당 지역 기반으로 상품을 볼 수 있어요.', '{t("ui_region_empty_hint")}'],
    ['동네 추가하기', '{t("ui_region_add_cta")}'],
    ['동네 추가', '{t("ui_region_add_title")}'],
    ['+ 동네 추가', '{t("ui_region_add_more")}'],
  ],
  "components/layout/SearchButton.tsx": [
    ['<span>검색</span>', '<span>{t("common_search")}</span>'],
  ],
  "components/home-feed/HomeFeedViewExperimental.tsx": [
    ['등록된 상품이 없어요', '{t("ui_home_feed_no_products")}'],
  ],
  "components/home-feed/HomeFeedCard.tsx": [
    ['광고', '{t("ui_home_feed_ad_label")}'],
  ],
  "components/member-benefits/MemberBenefitCard.tsx": [
    ['비활성', '{t("ui_member_benefit_inactive")}'],
    ['· 프로필 배지: {policy.badgeLabel}', '{t("ui_member_benefit_profile_badge", { label: policy.badgeLabel })}'],
    ['· 노출 우선: 홈 +{policy.homePriorityBoost} / 검색 +{policy.searchPriorityBoost} / 상점 featured +{policy.shopFeaturedPriorityBoost}', '{t("ui_member_benefit_priority_boost", { home: policy.homePriorityBoost, search: policy.searchPriorityBoost, shop: policy.shopFeaturedPriorityBoost })}'],
    ['· 포인트 보너스: {(policy.pointRewardBonusRate * 100).toFixed(0)}%', '{t("ui_member_benefit_point_bonus", { rate: (policy.pointRewardBonusRate * 100).toFixed(0) })}'],
    ['· 광고 할인: {(policy.adDiscountRate * 100).toFixed(0)}%', '{t("ui_member_benefit_ad_discount", { rate: (policy.adDiscountRate * 100).toFixed(0) })}'],
    ['· 상점 개설 가능', '{t("ui_member_benefit_can_open_shop")}'],
    ['· 프리미엄 노출 신청 가능', '{t("ui_member_benefit_premium_promo")}'],
  ],
  "components/orders/OrdersHubStoreAdminAccess.tsx": [
    ['매장 정보 {t("common_loading")}', '{t("ui_orders_hub_store_loading")}'],
    ['매장 DB가 연결되지 않았습니다.', '{t("ui_orders_hub_db_disconnected")}'],
    ['매장을 불러오지 못했습니다. ({hub.message})', '{t("ui_orders_hub_load_failed", { message: hub.message })}'],
    ['상태를 확인할 수 없습니다.', '{t("ui_orders_hub_status_unknown")}'],
    ['aria-label="매장 관리 메뉴"', 'aria-label={t("ui_orders_hub_menu_aria")}'],
    ['aria-label="{t("common_close")} 메뉴"', 'aria-label={t("ui_orders_hub_close_menu_aria")}'],
    ['매장 관리', '{t("ui_orders_hub_store_manage")}'],
    ['aria-label="매장 관리자 메뉴 열기"', 'aria-label={t("ui_orders_hub_open_menu_aria")}'],
  ],
};

for (const [rel, reps] of Object.entries(FILE_REPLACEMENTS)) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) {
    console.warn("missing", rel);
    continue;
  }
  let c = fs.readFileSync(fp, "utf8");
  const before = c;
  for (const [from, to] of reps) {
    if (from && c.includes(from)) c = c.split(from).join(to);
    else if (from) console.warn("  not found in", rel, from.slice(0, 40));
  }
  if (c !== before) {
    fs.writeFileSync(fp, c);
    console.log("fixed", rel);
  }
}
