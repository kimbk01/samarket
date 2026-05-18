/**
 * 11단계: 신고 사유 옵션
 */

export const REPORT_REASONS: {
  code: string;
  labelKey:
    | "ui_report_reason_spam"
    | "ui_report_reason_fraud"
    | "ui_report_reason_abusive"
    | "ui_report_reason_no_show"
    | "ui_report_reason_inappropriate"
    | "ui_report_reason_fake"
    | "ui_report_reason_other";
}[] = [
  { code: "spam", labelKey: "ui_report_reason_spam" },
  { code: "fraud", labelKey: "ui_report_reason_fraud" },
  { code: "abusive_language", labelKey: "ui_report_reason_abusive" },
  { code: "no_show", labelKey: "ui_report_reason_no_show" },
  { code: "inappropriate_item", labelKey: "ui_report_reason_inappropriate" },
  { code: "fake_listing", labelKey: "ui_report_reason_fake" },
  { code: "other", labelKey: "ui_report_reason_other" },
];

/** 게시글 신고 사유 (리스트/상세 신고 화면용) */
export const POST_REPORT_REASONS: { code: string; label: string; subLabel?: string; isAuthor?: boolean }[] = [
  { code: "prohibited_item", label: "거래 금지 물품이에요" },
  { code: "professional_seller", label: "전문판매업자 같아요" },
  { code: "fraud", label: "사기인 것 같아요" },
  {
    code: "wrong_service",
    label: "다른 서비스에 등록되어야 하는 게시글이에요",
    subLabel: "커뮤니티, 부동산, 알바 등 다른 서비스에 등록되어야 하는 게시글",
  },
  { code: "inappropriate_behavior", label: "부적절한 행위가 있어요" },
  { code: "report_author", label: "작성자 신고하기", isAuthor: true },
];
