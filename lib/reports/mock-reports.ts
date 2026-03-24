/**
 * 11단계: 신고 mock (Supabase·관리자 연동 시 교체)
 */

import type { Report, ReportTargetType } from "@/lib/types/report";
import { MOCK_DATA_AS_OF_MS } from "@/lib/mock-time-anchor";

const CURRENT_USER_ID = "me";

/** 12단계: 관리자 목록 확인용 seed (실제 연동 시 비움) */
export const MOCK_REPORTS: Report[] = [
  {
    id: "rpt-seed-1",
    reporterId: "me",
    targetType: "product",
    targetId: "1",
    targetUserId: "s1",
    reasonCode: "fake_listing",
    reasonLabel: "허위 게시",
    detail: "사진과 다릅니다.",
    createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 2).toISOString(),
    status: "pending",
  },
  {
    id: "rpt-seed-2",
    reporterId: "me",
    targetType: "user",
    targetId: "s2",
    targetUserId: "s2",
    reasonCode: "abusive_language",
    reasonLabel: "욕설·비방",
    detail: "",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    status: "pending",
  },
  {
    id: "rpt-seed-3",
    reporterId: "me",
    targetType: "chat",
    targetId: "room-1",
    targetUserId: "s1",
    reasonCode: "abusive_language",
    reasonLabel: "욕설·비방",
    detail: "",
    createdAt: new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60).toISOString(),
    status: "pending",
  },
];

export function addReport(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  targetUserId: string,
  reasonCode: string,
  reasonLabel: string,
  detail: string
): Report {
  const newReport: Report = {
    id: `rpt-${Date.now()}`,
    reporterId,
    targetType,
    targetId,
    targetUserId,
    reasonCode,
    reasonLabel,
    detail: detail.trim(),
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  MOCK_REPORTS.push(newReport);
  return newReport;
}

export function hasReported(
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string
): boolean {
  return MOCK_REPORTS.some(
    (r) =>
      r.reporterId === reporterId &&
      r.targetType === targetType &&
      r.targetId === targetId
  );
}
