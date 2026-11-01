import type { MessageKey } from "@/lib/i18n/messages";
import type { MyReportSource, MyReportStage } from "@/lib/reports/my-reports";

/** 내 신고 내역 표시 이름 (알림 최종 설계 §5-5) */
export const MY_REPORT_SOURCE_KEY: Record<MyReportSource, MessageKey> = {
  community: "my_report_source_community",
  messenger: "my_report_source_messenger",
  trade_chat: "my_report_source_trade_chat",
  trade: "my_report_source_trade",
};

export const MY_REPORT_STAGE_KEY: Record<MyReportStage, MessageKey> = {
  received: "my_report_stage_received",
  reviewing: "my_report_stage_reviewing",
  resolved: "my_report_stage_resolved",
  rejected: "my_report_stage_rejected",
};

/** 상태 배지 — 조치 완료만 브랜드 강조, 검토 중 = 주의, 그 외 = 보통 */
export const MY_REPORT_STAGE_CLASS: Record<MyReportStage, string> = {
  received: "bg-sam-surface-muted text-sam-fg",
  reviewing: "bg-sam-warning-soft text-sam-warning",
  resolved: "bg-sam-primary-soft text-sam-primary",
  rejected: "bg-sam-surface-muted text-sam-muted",
};
