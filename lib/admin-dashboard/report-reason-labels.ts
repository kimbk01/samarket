import type { MessageKey } from "@/lib/i18n/messages";

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

/** 위 표의 화면 언어 키 — 어드민 화면은 이 키로 그린다 (같은 코드·같은 뜻) */
export const ADMIN_DASHBOARD_REPORT_REASON_LABEL_KEYS: Record<string, MessageKey> = {
  spam: "admin_dashboard_report_reason_spam",
  inappropriate: "admin_dashboard_report_reason_inappropriate",
  scam: "admin_dashboard_report_reason_scam",
  fraud: "admin_dashboard_report_reason_fraud",
  harassment: "admin_dashboard_report_reason_harassment",
  fake_listing: "admin_dashboard_report_reason_fake_listing",
  other: "admin_dashboard_report_reason_other",
  prohibited_item: "admin_dashboard_report_reason_prohibited_item",
  professional_seller: "admin_dashboard_report_reason_professional_seller",
  wrong_service: "admin_dashboard_report_reason_wrong_service",
  inappropriate_behavior: "admin_dashboard_report_reason_inappropriate_behavior",
};
