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

/** 게시글 신고 사유 (리스트/상세 신고 화면용) — `code` 가 그대로 reports.reason_code (관리자 라벨과 같은 키) */
export const POST_REPORT_REASONS: {
  code: string;
  labelKey:
    | "ui_post_report_reason_prohibited_item"
    | "ui_post_report_reason_professional_seller"
    | "ui_post_report_reason_fraud"
    | "ui_post_report_reason_wrong_service"
    | "ui_post_report_reason_inappropriate_behavior"
    | "ui_post_report_reason_other"
    | "ui_post_report_reason_report_author";
  subLabelKey?: "ui_post_report_reason_wrong_service_sub";
  isAuthor?: boolean;
  /** 「기타」— 상세 내용을 반드시 적어야 접수된다 */
  detailRequired?: boolean;
}[] = [
  { code: "prohibited_item", labelKey: "ui_post_report_reason_prohibited_item" },
  { code: "professional_seller", labelKey: "ui_post_report_reason_professional_seller" },
  { code: "fraud", labelKey: "ui_post_report_reason_fraud" },
  {
    code: "wrong_service",
    labelKey: "ui_post_report_reason_wrong_service",
    subLabelKey: "ui_post_report_reason_wrong_service_sub",
  },
  { code: "inappropriate_behavior", labelKey: "ui_post_report_reason_inappropriate_behavior" },
  { code: "other", labelKey: "ui_post_report_reason_other", detailRequired: true },
  { code: "report_author", labelKey: "ui_post_report_reason_report_author", isAuthor: true },
];
