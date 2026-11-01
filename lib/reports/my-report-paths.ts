/**
 * 내 신고 내역 경로·출처 (알림 최종 설계 §5-5) — 가벼운 공용 모듈(클라이언트·알림 발송 공용, DB 의존 없음).
 */
export const MY_REPORT_SOURCES = ["community", "messenger", "trade_chat", "trade"] as const;
export type MyReportSource = (typeof MY_REPORT_SOURCES)[number];

export function isMyReportSource(v: unknown): v is MyReportSource {
  return typeof v === "string" && (MY_REPORT_SOURCES as readonly string[]).includes(v);
}

export const MY_REPORTS_HREF = "/mypage/reports";

export function buildMyReportDetailPath(source: MyReportSource, id: string): string {
  return `${MY_REPORTS_HREF}/${source}/${encodeURIComponent(id.trim())}`;
}

/** 신고 처리 알림 `source`(관리자 큐 이름) → 내 신고 내역 source. */
export function myReportSourceFromChatReportSource(source: string): MyReportSource | null {
  if (source === "messenger") return "messenger";
  if (source === "trade_chat") return "trade_chat";
  if (source === "trade_report") return "trade";
  return null;
}
