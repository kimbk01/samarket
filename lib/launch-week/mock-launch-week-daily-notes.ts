/**
 * 49단계: Day별 운영 메모 mock (37 보고서 handoff 연계 placeholder)
 */

import type { LaunchWeekDailyNote, LaunchWeekDayNumber } from "@/lib/types/launch-week";

const NOTES: LaunchWeekDailyNote[] = [
  {
    id: "lwdn-1",
    dayNumber: 1,
    summary: "오픈 Day1. 가입·상품 등록 양호. 이미지 업로드 일부 500 확인됨.",
    topIssues: "이미지 업로드 500, 관리자 메뉴 권한 표시",
    topWins: "가입/등록 플로우 안정",
    handoffNote: "Day2 팀에 이미지 이슈 인수인계. Daily check / shift handoff placeholder.",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
  {
    id: "lwdn-2",
    dayNumber: 2,
    summary: "Day2. 채팅 API 지연 발생. 피드 fallback 1회 후 복구.",
    topIssues: "채팅 지연, fallback 발생",
    topWins: "자동 복구 정상 동작",
    handoffNote: "채팅 담당자와 협의 예정.",
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getLaunchWeekDailyNotes(filters?: {
  dayNumber?: LaunchWeekDayNumber;
}): LaunchWeekDailyNote[] {
  let list = [...NOTES].sort(
    (a, b) =>
      b.dayNumber - a.dayNumber ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.dayNumber)
    list = list.filter((n) => n.dayNumber === filters.dayNumber);
  return list;
}

export function getLaunchWeekDailyNoteByDay(
  dayNumber: LaunchWeekDayNumber
): LaunchWeekDailyNote | undefined {
  return NOTES.filter((n) => n.dayNumber === dayNumber).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}
