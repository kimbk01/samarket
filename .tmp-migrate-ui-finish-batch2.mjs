import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}
function write(p, s) {
  fs.writeFileSync(path.join(ROOT, p), s, "utf8");
}

const files = [
  "components/post/PostCommunityCommentsSection.tsx",
  "components/post/PostDetailRelatedSections.tsx",
  "components/post/PostDetailSellerMoreSheet.tsx",
  "components/post/PostDetailView.tsx",
  "components/post/ReportReasonModal.tsx",
  "components/post/TradePostAdApplySheet.tsx",
  "components/ads/AdApplyForm.tsx",
  "components/ads/AdPostCard.tsx",
  "components/ads/AdProductSelector.tsx",
  "components/ads/MyPostAdList.tsx",
  "components/ads/PostAdProposalModal.tsx",
  "components/offers/MyOffersView.tsx",
  "components/offers/OfferListSeller.tsx",
  "components/offers/OfferModal.tsx",
  "components/offers/OfferStatusBuyer.tsx",
  "components/reviews/ReviewForm.tsx",
  "components/reviews/ReviewWriteForm.tsx",
  "components/reviews/ReviewList.tsx",
  "components/reviews/TrustSummaryCard.tsx",
  "components/chats/StoreOrderSellerOrderPanel.tsx",
];

const replacements = [
  [/>답글</g, ">{t(\"community_comment_reply\")}<"],
  [/<h3[^>]*>댓글<\/h3>/g, '<h3 className={`font-semibold text-sam-fg ${Sam.text.body}`}>{t("community_stat_comments_title")}</h3>'],
  [/첫 댓글을 남겨 보세요\./g, '{t("community_comment_first")}'],
  [/<span>이 댓글에 답글 작성 중<\/span>/g, '<span>{t("ui_post_comment_replying")}</span>'],
  [/파트너 · 광고/g, '{t("ui_post_related_partner_ad")}'],
  [/aria-label="광고 안내"/g, 'aria-label={t("ui_post_ad_info_aria")}'],
  [/title="광고 상품 영역"/g, 'title={t("ui_post_ad_product_area_title")}'],
  [/aria-label="다음 광고 페이지"/g, 'aria-label={t("ui_post_ad_next_page_aria")}'],
  [/title="판매자의 다른 물품"/g, 'title={t("ui_post_related_seller_items")}'],
  [/title="보고 있는 물품과 비슷한 물품"/g, 'title={t("ui_post_related_similar_items")}'],
  [/>내 물품<\/h2>/g, '>{t("ui_post_my_listing_title")}</h2>'],
  [/처리 중…/g, '{t("community_meeting_join_processing")}'],
  [/>환전 정보<\/h3>/g, '>{t("trade_132")}</h3>'],
  [/>차량 정보<\/h3>/g, '>{t("trade_112")}</h3>'],
  [/>부동산 정보<\/h3>/g, '>{t("ui_post_real_estate_info")}</h3>'],
  [/>관심<\/span>/g, '>{t("ui_fav_interest")}</span>'],
  [/예상 중개수수료/g, '{t("ui_post_estimated_broker_fee")}'],
  [/제안 상태 확인 중…/g, '{t("ui_post_offer_status_checking")}'],
  [/title="받은 가격 제안"/g, 'title={t("ui_offer_received_title")}'],
  [/>신고하기<\/h2>/g, '>{t("ui_report_submit")}</h2>'],
  [/placeholder="신고 사유"/g, 'placeholder={t("ui_report_reason_title")}'],
  [/>상품 설명<\/h3>/g, '>{t("ui_post_product_description_heading")}</h3>'],
  [/>유료 광고 신청<\/h2>/g, '>{t("ui_post_paid_ad_apply_title")}</h2>'],
  [/신청 가능한 광고 상품이 없습니다\./g, '{t("ui_post_paid_ad_empty_products")}'],
  [/신청 체크리스트/g, '{t("ui_post_paid_ad_checklist")}'],
  [/<option value="">선택<\/option>/g, '<option value="">{t("ui_product_category_select")}</option>'],
  [/예상 금액/g, '{t("ui_ad_estimated_amount")}'],
  [/placeholder="입금 참고용 메모"/g, 'placeholder={t("ui_ad_deposit_memo_ph")}'],
  [/자세히 보기/g, '{t("ui_ad_view_details")}'],
  [/>광고 신청<\/h2>/g, '>{t("ui_ad_apply_title")}</h2>'],
  [/내 포인트<\/span>/g, '>{t("ui_ad_my_points")}</span>'],
  [/이 게시판에 등록된 광고 상품이 없습니다\./g, '{t("ui_ad_no_board_products")}'],
  [/사용 가능/g, '{t("ui_ad_points_available")}'],
  [/결제 방식/g, '{t("points_ui_payment_method")}'],
  [/포인트 부족 \{shortfall\.toLocaleString\(\)\}P/g, '{t("ui_ad_points_short_title", { amount: shortfall.toLocaleString() })}'],
  [/placeholder="입금자명 \(필수\)"/g, 'placeholder={t("ui_ad_depositor_required_ph")}'],
  [/placeholder="메모 \(선택\)"/g, 'placeholder={t("ui_ad_memo_optional_ph")}'],
  [/입금 안내/g, '{t("ui_ad_deposit_guide_title")}'],
  [/관리자 확인 후 광고가 승인됩니다\./g, '{t("ui_ad_deposit_guide_body")}'],
  [/게시글 광고 신청 내역이 없습니다\./g, '{t("ui_ad_post_list_empty")}'],
  [/광고 신청 완료!/g, '{t("ui_ad_apply_complete_title")}'],
  [/이 글을 광고로 노출할까요\?/g, '{t("ui_ad_promote_confirm_title")}'],
  [/내 포인트 잔액/g, '{t("ui_ad_my_points_balance")}'],
  [/제안일 \{formatTimeAgo/g, '{t("ui_offer_date_label", { time: formatTimeAgo'],
  [/받은 가격 제안<\/h3>/g, '{t("ui_offer_received_title")}</h3>'],
  [/aria-label="가격 제안 불러오는 중"/g, 'aria-label={t("ui_offer_loading_aria")}'],
  [/도착한 제안이 없어요/g, '{t("ui_offer_empty_title")}'],
  [/아직 도착한 가격 제안이 없습니다\./g, '{t("ui_offer_empty_body")}'],
  [/제안 가격/g, '{t("ui_offer_price_label")}'],
  [/메시지 \(선택\)/g, '{t("ui_offer_message_optional")}'],
  [/placeholder="판매자에게 전달할 내용을 적어 주세요\."/g, 'placeholder={t("ui_offer_message_ph")}'],
  [/판매자 응답 대기중입니다\./g, '{t("ui_offer_waiting_seller")}'],
  [/다시 제안하기/g, '{t("ui_offer_retry_label")}'],
  [/평가<\/p>/g, '{t("ui_review_evaluation")}</p>'],
  [/평점<\/p>/g, '{t("ui_review_rating")}</p>'],
  [/태그 \(선택\)/g, '{t("ui_review_tags_optional")}'],
  [/placeholder="거래는 어떠셨나요\?"/g, 'placeholder={t("ui_review_comment_ph")}'],
  [/부정\/비매너 평가는 상대방에게 익명으로 표시/g, '{t("ui_review_anonymous_negative")}'],
  [/아직 받은 후기가 없어요/g, '{t("ui_review_empty")}'],
  [/후기 \{summary\.reviewCount\}/g, '{t("ui_review_count_short", { count: summary.reviewCount })}'],
  [/후기 \{summary\.reviewCount\}개/g, '{t("ui_review_count_full", { count: summary.reviewCount })}'],
  [/평균 \{summary\.averageRating\}점/g, '{t("ui_review_avg_rating", { rating: summary.averageRating })}'],
  [/좋아요 \{summary\.positiveCount\}/g, '{t("ui_review_positive_count", { count: summary.positiveCount })}'],
  [/이 채팅에서는 전송할 수 없습니다\./g, '{t("ui_store_order_chat_send_blocked")}'],
  [/주문 \{t\("common_loading"\)\}/g, '{t("ui_store_order_loading")}'],
  [/<span className="sam-text-body-lg font-medium text-sam-fg">신고<\/span>/g, '<span className="sam-text-body-lg font-medium text-sam-fg">{t("common_report")}</span>'],
  [
    /window\.alert\("네트워크 오류입니다\."\)/g,
    'window.alert(t("mypage_comp_product_network_error_short"))',
  ],
  [
    /window\.alert\("네트워크 오류로 삭제하지 못했습니다\."\)/g,
    'window.alert(t("ui_post_delete_network_error"))',
  ],
];

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  let src = read(rel);
  const orig = src;
  for (const [re, rep] of replacements) {
    src = src.replace(re, rep);
  }
  if (src !== orig) {
    write(rel, src);
    console.log("patched2", rel);
  }
}
