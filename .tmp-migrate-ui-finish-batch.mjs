import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}
function write(p, s) {
  fs.writeFileSync(path.join(ROOT, p), s, "utf8");
}

function ensureUseI18n(src) {
  if (src.includes("useI18n")) return src;
  if (!src.includes('"use client"')) return src;
  const imp = `import { useI18n } from "@/components/i18n/AppLanguageProvider";\n`;
  return src.replace(/("use client";\r?\n\r?\n)/, `$1${imp}`);
}

function addHookToExportFunction(src, fnPattern) {
  if (src.includes("const { t } = useI18n()")) return src;
  return src.replace(fnPattern, (m) => `${m}\n  const { t } = useI18n();`);
}

const files = [
  "components/post/PostCard.tsx",
  "components/post/PostCommunityCommentsSection.tsx",
  "components/post/PostDetailMoreBottomSheet.tsx",
  "components/post/PostDetailRelatedSections.tsx",
  "components/post/PostDetailSellerMoreSheet.tsx",
  "components/post/PostDetailSellerTradeLifecycleBar.tsx",
  "components/post/PostListMenuBottomSheet.tsx",
  "components/post/ReportReasonModal.tsx",
  "components/post/TradePostAdApplySheet.tsx",
  "components/ads/AdApplyForm.tsx",
  "components/ads/AdPostCard.tsx",
  "components/ads/AdProductSelector.tsx",
  "components/ads/MyPostAdList.tsx",
  "components/ads/PostAdProposalModal.tsx",
  "components/offers/MyOffersView.tsx",
  "components/offers/OfferListSeller.tsx",
  "components/offers/OfferListSellerModal.tsx",
  "components/offers/OfferModal.tsx",
  "components/offers/OfferStatusBuyer.tsx",
  "components/offers/OfferButton.tsx",
  "components/reviews/ReviewForm.tsx",
  "components/reviews/ReviewWriteForm.tsx",
  "components/reviews/ReviewList.tsx",
  "components/reviews/TrustSummaryCard.tsx",
  "components/chats/StoreOrderSellerOrderPanel.tsx",
];

const replacements = [
  [/>\s*이미지\s*</g, ">{t(\"ui_product_gallery_fallback\")}<"],
  [/aria-label="메뉴"/g, 'aria-label={t("ui_home_rail_menu_open")}'],
  [/aria-label="닫기"/g, 'aria-label={t("ui_sheet_close_aria")}'],
  [/aria-label="더보기"/g, 'aria-label={t("ui_product_more_aria")}'],
  [
    /window\.alert\("네트워크 오류로 삭제하지 못했습니다\."\)/g,
    'window.alert(t("ui_post_delete_network_error"))',
  ],
  [
    /window\.alert\("네트워크 오류입니다\."\)/g,
    'window.alert(t("mypage_comp_product_network_error_short"))',
  ],
  [/alert\("신고가 접수되었습니다\."\)/g, 'alert(t("cm_ui_report_submitted"))'],
  [
    /window\.alert\("이 사용자의 글을 숨겼습니다\."\)/g,
    'window.alert(t("ui_post_user_hidden_alert"))',
  ],
  [
    /window\.confirm\("이 글을 삭제할까요\? 삭제 후에는 피드에서 사라져요\."\)/g,
    'window.confirm(t("ui_post_delete_confirm_feed"))',
  ],
  [
    /window\.confirm\("이 글을 숨길까요\? 목록에서 보이지 않게 됩니다\."\)/g,
    'window.confirm(t("ui_post_hide_confirm"))',
  ],
  [
    /window\.confirm\("글을 삭제할까요\? 삭제 후에는 목록에서 제거됩니다\."\)/g,
    'window.confirm(t("ui_post_delete_confirm_list"))',
  ],
  [
    /window\.confirm\(`판매 진행 상황을 "\$\{label\}"\(으\)로 변경할까요\?`\)/g,
    'window.confirm(t("mypage_comp_product_listing_change_confirm", { label }))',
  ],
  [
    /window\.alert\("미리보기 글에서는 예약할 수 없습니다\."\)/g,
    'window.alert(t("ui_post_preview_no_reserve"))',
  ],
  [
    /window\.alert\("문의 채팅이 있는 구매자만 예약할 수 있습니다\."\)/g,
    'window.alert(t("mypage_comp_product_reserve_inquiry_only"))',
  ],
  [
    /window\.alert\("미리보기 글에서는 완료 처리할 수 없습니다\."\)/g,
    'window.alert(t("ui_post_preview_no_complete"))',
  ],
  [
    /window\.alert\("예약된 구매자와의 활성 채팅을 찾을 수 없습니다\."\)/g,
    'window.alert(t("mypage_comp_product_reserved_chat_missing"))',
  ],
  [
    /window\.alert\("문의 중인 채팅이 없으면 거래완료를 진행할 수 없습니다\."\)/g,
    'window.alert(t("mypage_comp_product_no_inquiry_for_complete"))',
  ],
  [
    /window\.confirm\("거래를 취소하고 판매 조정 가능 상태로 돌아갈까요\?"\)/g,
    'window.confirm(t("ui_post_cancel_trade_confirm"))',
  ],
  [
    /window\.confirm\("다시 판매중으로 올릴까요\?"\)/g,
    'window.confirm(t("ui_post_relist_confirm"))',
  ],
  [/subtitle="채팅 문의가 있는 구매자만 표시됩니다\."/g, 'subtitle={t("ui_post_buyer_picker_subtitle")}'],
  [/title="예약할 구매자 선택"/g, 'title={t("mypage_comp_product_pick_reserve_title")}'],
  [/title="거래완료할 구매자 선택"/g, 'title={t("mypage_comp_product_pick_complete_title")}'],
  [
    /<p className="text-center sam-text-xxs text-sam-muted">숨김 처리된 글입니다\.<\/p>/g,
    '<p className="text-center sam-text-xxs text-sam-muted">{t("ui_post_hidden_listing")}</p>',
  ],
  [/불러오는 중…/g, '{t("common_loading")}'],
  [/불러오는 중\.\.\./g, '{t("common_loading")}'],
  [/"신고"/g, '{t("common_report")}'],
  [/"신고하기"/g, '{t("ui_report_submit")}'],
  [/placeholder="신고 사유"/g, 'placeholder={t("ui_report_reason_title")}'],
];

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.warn("skip missing", rel);
    continue;
  }
  let src = read(rel);
  const orig = src;
  src = ensureUseI18n(src);
  if (!src.includes("const { t } = useI18n()")) {
    const m = src.match(/export function (\w+)/);
    if (m) {
      src = addHookToExportFunction(src, new RegExp(`export function ${m[1]}\\([^)]*\\)\\s*\\{`));
    }
  }
  for (const [re, rep] of replacements) {
    src = src.replace(re, rep);
  }
  if (src !== orig) {
    write(rel, src);
    console.log("patched", rel);
  }
}

console.log("done batch (partial — run manual for PostDetailView)");
