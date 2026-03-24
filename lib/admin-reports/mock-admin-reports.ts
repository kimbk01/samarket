/**
 * 12단계: 관리자 신고 목록/상세 (11단계 MOCK_REPORTS 기반)
 */

import type { Report, ReportStatus } from "@/lib/types/report";
import { MOCK_REPORTS } from "@/lib/reports/mock-reports";
import { getProductById } from "@/lib/mock-products";
import { getNickname } from "./mock-user-moderation";

export type AdminReport = Report;

function enrichReport(r: Report): Report {
  const reporterNickname = r.reporterNickname ?? getNickname(r.reporterId);
  let targetTitle = r.targetTitle;
  if (targetTitle === undefined) {
    if (r.targetType === "product") {
      targetTitle = getProductById(r.targetId)?.title ?? r.targetId;
    } else if (r.targetType === "chat") {
      targetTitle = `채팅 ${r.targetId}`;
    } else {
      targetTitle = getNickname(r.targetUserId) || r.targetId;
    }
  }
  return {
    ...r,
    reporterNickname,
    targetTitle,
  };
}

export function getReportsForAdmin(): Report[] {
  return MOCK_REPORTS.map(enrichReport);
}

export function getReportById(id: string): Report | undefined {
  const r = MOCK_REPORTS.find((x) => x.id === id);
  return r ? enrichReport(r) : undefined;
}

export function updateReportStatus(id: string, status: ReportStatus): boolean {
  const r = MOCK_REPORTS.find((x) => x.id === id);
  if (!r) return false;
  r.status = status;
  return true;
}
