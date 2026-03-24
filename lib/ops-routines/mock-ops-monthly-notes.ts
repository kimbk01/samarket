/**
 * 50단계: 월간 운영 메모 mock
 */

import type { OpsMonthlyNote } from "@/lib/types/ops-routines";

const thisMonth = new Date().toISOString().slice(0, 7);
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);

const NOTES: OpsMonthlyNote[] = [
  {
    id: "omn-1",
    monthKey: lastMonth,
    summary: "첫 달 운영 정착. 추천·모니터링 안정화. 문서 업데이트 일부 지연.",
    topRisks: "문서 최신화 지연, carry-over 1건",
    topWins: "주간 루틴 이행률 90%",
    followUpFocus: "다음 달 carry-over task 정리, SOP 갱신",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
  {
    id: "omn-2",
    monthKey: thisMonth,
    summary: "월간 운영 루틴 진행 중. 성숙도/벤치마크 점검 완료.",
    topRisks: "SOP 문서 overdue",
    topWins: "월간 리포트 검토 완료",
    followUpFocus: "문서 갱신, 다음 달 carry-over 최소화",
    createdAt: new Date().toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getOpsMonthlyNotes(filters?: {
  monthKey?: string;
}): OpsMonthlyNote[] {
  let list = [...NOTES].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.monthKey)
    list = list.filter((n) => n.monthKey === filters.monthKey);
  return list;
}

export function getOpsMonthlyNoteByMonth(
  monthKey: string
): OpsMonthlyNote | undefined {
  return NOTES.filter((n) => n.monthKey === monthKey).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}
