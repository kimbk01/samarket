/**
 * 39단계: 운영 문서 mock
 */

import type { OpsDocument, OpsDocStatus, OpsDocType } from "@/lib/types/ops-docs";

const DOCUMENTS: OpsDocument[] = [
  {
    id: "od-1",
    docType: "playbook",
    title: "추천 피드 Fallback 대응 플레이북",
    slug: "feed-fallback-playbook",
    category: "incident_response",
    status: "active",
    summary: "추천 피드 Fallback 발생 시 점검 및 복구 절차",
    content: "1. 모니터링 대시보드에서 Fallback 발생 확인\n2. 추천 모니터링 이슈 목록 확인\n3. 필요 시 롤백 또는 버전 전환 검토",
    tags: ["feed", "fallback", "recommendation"],
    versionLabel: "1.0",
    isPinned: true,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
    approvedByAdminId: "admin1",
    approvedByAdminNickname: "관리자",
    adminMemo: "",
  },
  {
    id: "od-2",
    docType: "sop",
    title: "일간 추천 점검 SOP",
    slug: "daily-recommendation-check-sop",
    category: "recommendation",
    status: "active",
    summary: "매일 추천 시스템 헬스체크 및 일간 보고서 검토 절차",
    content: "매일 오전 10시 전:\n- 추천 모니터링 대시보드 헬스 확인\n- 일간 보고서 KPI 검토\n- 이상 시 플레이북 참조",
    tags: ["sop", "recommendation", "daily"],
    versionLabel: "1.0",
    isPinned: false,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
    approvedByAdminId: "admin1",
    approvedByAdminNickname: "관리자",
    adminMemo: "",
  },
  {
    id: "od-3",
    docType: "scenario",
    title: "추천 버전 롤백 시나리오",
    slug: "recommendation-rollback-scenario",
    category: "rollback",
    status: "active",
    summary: "배포된 추천 버전 문제 시 롤백 실행 시나리오",
    content: "문제 감지 → 배포 관리 화면에서 이전 안정 버전 선택 → 롤백 실행 → 모니터링으로 지표 확인",
    tags: ["rollback", "deployment", "recommendation"],
    versionLabel: "1.0",
    isPinned: true,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
    approvedByAdminId: null,
    approvedByAdminNickname: null,
    adminMemo: "",
  },
  {
    id: "od-4",
    docType: "playbook",
    title: "광고 노출 오류 대응",
    slug: "ads-display-error-playbook",
    category: "ads",
    status: "draft",
    summary: "광고 영역 노출 오류 시 점검 절차 (초안)",
    content: "배너/광고 관리에서 해당 캠페인 상태 확인 후 일시 중단 또는 수정",
    tags: ["ads", "draft"],
    versionLabel: "0.1",
    isPinned: false,
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    createdByAdminId: "admin1",
    createdByAdminNickname: "관리자",
    approvedByAdminId: null,
    approvedByAdminNickname: null,
    adminMemo: "검토 후 활성화 예정",
  },
];

export function getOpsDocuments(filters?: {
  docType?: OpsDocType;
  status?: OpsDocStatus;
  category?: string;
  search?: string;
  sort?: "updated" | "title" | "status";
  limit?: number;
}): OpsDocument[] {
  let list = [...DOCUMENTS];
  if (filters?.docType) list = list.filter((d) => d.docType === filters.docType);
  if (filters?.status) list = list.filter((d) => d.status === filters.status);
  if (filters?.category) list = list.filter((d) => d.category === filters.category);
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.summary.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        d.category.toLowerCase().includes(q)
    );
  }
  if (filters?.sort === "title") {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filters?.sort === "status") {
    const order = { active: 0, draft: 1, archived: 2 };
    list.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  } else {
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsDocumentById(id: string): OpsDocument | undefined {
  return DOCUMENTS.find((d) => d.id === id);
}

export function getOpsDocumentBySlug(slug: string): OpsDocument | undefined {
  return DOCUMENTS.find((d) => d.slug === slug);
}

export function addOpsDocument(
  input: Omit<OpsDocument, "id" | "createdAt" | "updatedAt">
): OpsDocument {
  const now = new Date().toISOString();
  const doc: OpsDocument = {
    ...input,
    id: `od-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  DOCUMENTS.push(doc);
  return doc;
}

export function updateOpsDocument(
  id: string,
  update: Partial<Pick<OpsDocument, "title" | "slug" | "category" | "status" | "summary" | "content" | "tags" | "versionLabel" | "isPinned" | "approvedByAdminId" | "approvedByAdminNickname" | "adminMemo">>
): OpsDocument | null {
  const doc = DOCUMENTS.find((d) => d.id === id);
  if (!doc) return null;
  const now = new Date().toISOString();
  Object.assign(doc, update, { updatedAt: now });
  return { ...doc };
}

export function setOpsDocumentStatus(
  id: string,
  status: OpsDocStatus
): OpsDocument | null {
  return updateOpsDocument(id, { status });
}
