/**
 * 11단계: 신고 사유 옵션
 */

export const REPORT_REASONS: { code: string; label: string }[] = [
  { code: "spam", label: "스팸" },
  { code: "fraud", label: "사기" },
  { code: "abusive_language", label: "욕설·비방" },
  { code: "no_show", label: "무응답·노쇼" },
  { code: "inappropriate_item", label: "부적절한 상품" },
  { code: "fake_listing", label: "허위 게시" },
  { code: "other", label: "기타" },
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
