/**
 * 38단계: 운영 회고 mock
 */

import type { OpsRetrospective } from "@/lib/types/ops-board";

const RETROS: OpsRetrospective[] = [
  {
    id: "opr-1",
    retrospectiveDate: new Date().toISOString().slice(0, 10),
    title: "주간 운영 회고",
    summary: "추천 피드 안정 운영, 일부 이슈 대응 완료.",
    wins: "홈 CTR 유지, Fallback 미발생",
    issues: "검색 빈피드율 일시 상승",
    learnings: "모니터링 알림 임계치 조정 검토",
    nextActions: "빈피드 임계치 검토; 액션아이템 생성",
    relatedSurface: "all",
    relatedReportId: "rr-1",
    createdAt: new Date().toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
  },
];

export function getOpsRetrospectives(filters?: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): OpsRetrospective[] {
  let list = [...RETROS].sort(
    (a, b) => new Date(b.retrospectiveDate).getTime() - new Date(a.retrospectiveDate).getTime()
  );
  if (filters?.fromDate)
    list = list.filter((r) => r.retrospectiveDate >= filters.fromDate!);
  if (filters?.toDate)
    list = list.filter((r) => r.retrospectiveDate <= filters.toDate!);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsRetrospectiveById(
  id: string
): OpsRetrospective | undefined {
  return RETROS.find((r) => r.id === id);
}

export function addOpsRetrospective(
  input: Omit<OpsRetrospective, "id">
): OpsRetrospective {
  const retro: OpsRetrospective = {
    ...input,
    id: `opr-${Date.now()}`,
  };
  RETROS.unshift(retro);
  return retro;
}

export function updateOpsRetrospective(
  id: string,
  update: Partial<Omit<OpsRetrospective, "id" | "createdAt" | "createdByAdminId" | "createdByAdminNickname">>
): OpsRetrospective | null {
  const r = RETROS.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, update);
  return { ...r };
}
