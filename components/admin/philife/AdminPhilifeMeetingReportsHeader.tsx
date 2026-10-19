"use client";

import { CommunityReportSourceSwitch } from "@/components/admin/community/reports/CommunityReportSourceSwitch";

/** 모임 신고 상단 — 신고 처리함(게시글·댓글·회원)과 오가는 링크 탭. 제목·설명은 목록 틀(CommunityListShell)이 그린다. */
export function AdminPhilifeMeetingReportsHeader() {
  return <CommunityReportSourceSwitch current="meeting" />;
}
