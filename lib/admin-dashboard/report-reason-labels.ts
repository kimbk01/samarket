/** Sync with getReportsFromDb REASON_LABELS (server-safe; that module is use client). */
export const ADMIN_DASHBOARD_REPORT_REASON_LABELS: Record<string, string> = {
  spam: "스팸",
  inappropriate: "부적절한 내용",
  scam: "사기",
  fraud: "사기",
  harassment: "괴롭힘",
  fake_listing: "허위 게시",
  other: "기타",
  prohibited_item: "거래 금지 물품",
  professional_seller: "전문판매업자 의심",
  wrong_service: "잘못된 서비스 게시",
  inappropriate_behavior: "부적절한 행위",
};
