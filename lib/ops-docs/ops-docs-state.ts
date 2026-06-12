/**
 * 운영 문서 — 문서·단계·변경 이력 단일 저장소.
 * 영속화: `ops-docs-db` + admin_settings (`ops_docs_v1`)
 */
import type {
  OpsDocument,
  OpsDocStatus,
  OpsDocType,
  OpsDocumentStep,
  OpsDocumentLog,
} from "@/lib/types/ops-docs";

function defaultDocuments(): OpsDocument[] {
  return [
    {
      id: "od-1",
      docType: "playbook",
      title: "추천 피드 Fallback 대응 플레이북",
      slug: "feed-fallback-playbook",
      category: "incident_response",
      status: "active",
      summary: "추천 피드 Fallback 발생 시 점검 및 복구 절차",
      content:
        "1. 모니터링 대시보드에서 Fallback 발생 확인\n2. 추천 모니터링 이슈 목록 확인\n3. 필요 시 롤백 또는 버전 전환 검토",
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
      content:
        "매일 오전 10시 전:\n- 추천 모니터링 대시보드 헬스 확인\n- 일간 보고서 KPI 검토\n- 이상 시 플레이북 참조",
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
      content:
        "문제 감지 → 배포 관리 화면에서 이전 안정 버전 선택 → 롤백 실행 → 모니터링으로 지표 확인",
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
}

function defaultDocumentSteps(): OpsDocumentStep[] {
  return [
    {
      id: "ods-1",
      documentId: "od-1",
      stepOrder: 1,
      title: "모니터링 대시보드 확인",
      description: "추천 모니터링에서 Fallback 발생 여부 및 원인 확인",
      isRequired: true,
      estimatedMinutes: 5,
      linkedType: null,
      linkedId: null,
    },
    {
      id: "ods-2",
      documentId: "od-1",
      stepOrder: 2,
      title: "관련 이슈/인시던트 확인",
      description: "해당 surface의 이슈 목록에서 관련 incident 링크 확인",
      isRequired: true,
      estimatedMinutes: 5,
      linkedType: "incident",
      linkedId: "inc-1",
    },
    {
      id: "ods-3",
      documentId: "od-1",
      stepOrder: 3,
      title: "필요 시 롤백 또는 버전 전환",
      description: "배포 관리에서 이전 안정 버전으로 롤백 검토",
      isRequired: false,
      estimatedMinutes: 10,
      linkedType: "deployment",
      linkedId: "rd-1",
    },
    {
      id: "ods-4",
      documentId: "od-2",
      stepOrder: 1,
      title: "헬스체크 확인",
      description: "추천 모니터링 헬스 상태 확인",
      isRequired: true,
      estimatedMinutes: 2,
      linkedType: null,
      linkedId: null,
    },
    {
      id: "ods-5",
      documentId: "od-2",
      stepOrder: 2,
      title: "일간 보고서 KPI 검토",
      description: "추천 보고서에서 당일 KPI 확인",
      isRequired: true,
      estimatedMinutes: 10,
      linkedType: "report",
      linkedId: "rr-1",
    },
    {
      id: "ods-6",
      documentId: "od-3",
      stepOrder: 1,
      title: "문제 버전 확인",
      description: "배포 관리에서 현재 live 버전 및 이슈 확인",
      isRequired: true,
      estimatedMinutes: 5,
      linkedType: "deployment",
      linkedId: null,
    },
    {
      id: "ods-7",
      documentId: "od-3",
      stepOrder: 2,
      title: "롤백 실행",
      description: "이전 안정 버전 선택 후 롤백 실행",
      isRequired: true,
      estimatedMinutes: 5,
      linkedType: "deployment",
      linkedId: null,
    },
  ];
}

function defaultDocumentLogs(): OpsDocumentLog[] {
  return [
    {
      id: "odl-1",
      documentId: "od-1",
      actionType: "create",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "",
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    },
    {
      id: "odl-2",
      documentId: "od-1",
      actionType: "approve",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "1.0 승인",
      createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    },
    {
      id: "odl-3",
      documentId: "od-1",
      actionType: "update",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "단계 3 링크 추가",
      createdAt: new Date().toISOString(),
    },
    {
      id: "odl-4",
      documentId: "od-2",
      actionType: "create",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "",
      createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    },
    {
      id: "odl-5",
      documentId: "od-3",
      actionType: "create",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    },
    {
      id: "odl-6",
      documentId: "od-4",
      actionType: "create",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      note: "초안",
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ];
}

const DOCUMENTS: OpsDocument[] = defaultDocuments();
const DOCUMENT_STEPS: OpsDocumentStep[] = defaultDocumentSteps();
const DOCUMENT_LOGS: OpsDocumentLog[] = defaultDocumentLogs();

export type OpsDocsBundleV1 = {
  version: 1;
  documents: OpsDocument[];
  documentSteps: OpsDocumentStep[];
  documentLogs: OpsDocumentLog[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsDocsBundle(): OpsDocsBundleV1 {
  return {
    version: 1,
    documents: defaultDocuments().map((d) => ({ ...d })),
    documentSteps: defaultDocumentSteps().map((s) => ({ ...s })),
    documentLogs: defaultDocumentLogs().map((l) => ({ ...l })),
  };
}

export function importOpsDocsBundle(bundle: OpsDocsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(DOCUMENTS, (bundle.documents ?? []).map((d) => ({ ...d })));
  replaceArray(DOCUMENT_STEPS, (bundle.documentSteps ?? []).map((s) => ({ ...s })));
  replaceArray(DOCUMENT_LOGS, (bundle.documentLogs ?? []).map((l) => ({ ...l })));
  if (!DOCUMENTS.length) replaceArray(DOCUMENTS, defaultDocuments());
  if (!DOCUMENT_STEPS.length) replaceArray(DOCUMENT_STEPS, defaultDocumentSteps());
  if (!DOCUMENT_LOGS.length) replaceArray(DOCUMENT_LOGS, defaultDocumentLogs());
}

export function exportOpsDocsBundle(): OpsDocsBundleV1 {
  return {
    version: 1,
    documents: DOCUMENTS.map((d) => ({ ...d })),
    documentSteps: DOCUMENT_STEPS.map((s) => ({ ...s })),
    documentLogs: DOCUMENT_LOGS.map((l) => ({ ...l })),
  };
}

/* ─── documents ─────────────────────────────────────────────── */

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
  update: Partial<
    Pick<
      OpsDocument,
      | "title"
      | "slug"
      | "category"
      | "status"
      | "summary"
      | "content"
      | "tags"
      | "versionLabel"
      | "isPinned"
      | "approvedByAdminId"
      | "approvedByAdminNickname"
      | "adminMemo"
    >
  >
): OpsDocument | null {
  const doc = DOCUMENTS.find((d) => d.id === id);
  if (!doc) return null;
  const now = new Date().toISOString();
  Object.assign(doc, update, { updatedAt: now });
  return { ...doc };
}

export function setOpsDocumentStatus(id: string, status: OpsDocStatus): OpsDocument | null {
  return updateOpsDocument(id, { status });
}

/* ─── document steps ────────────────────────────────────────── */

export function getOpsDocumentSteps(documentId: string): OpsDocumentStep[] {
  return DOCUMENT_STEPS.filter((s) => s.documentId === documentId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}

export function getOpsDocumentStepById(id: string): OpsDocumentStep | undefined {
  return DOCUMENT_STEPS.find((s) => s.id === id);
}

export function addOpsDocumentStep(input: Omit<OpsDocumentStep, "id">): OpsDocumentStep {
  const step: OpsDocumentStep = {
    ...input,
    id: `ods-${Date.now()}`,
  };
  DOCUMENT_STEPS.push(step);
  return step;
}

export function updateOpsDocumentStep(
  id: string,
  update: Partial<
    Pick<
      OpsDocumentStep,
      | "stepOrder"
      | "title"
      | "description"
      | "isRequired"
      | "estimatedMinutes"
      | "linkedType"
      | "linkedId"
    >
  >
): OpsDocumentStep | null {
  const step = DOCUMENT_STEPS.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, update);
  return { ...step };
}

export function deleteOpsDocumentStep(id: string): boolean {
  const idx = DOCUMENT_STEPS.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  DOCUMENT_STEPS.splice(idx, 1);
  return true;
}

/* ─── document logs ─────────────────────────────────────────── */

export function getOpsDocumentLogs(
  documentId: string,
  options?: { limit?: number }
): OpsDocumentLog[] {
  const list = DOCUMENT_LOGS.filter((l) => l.documentId === documentId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsDocumentLog(input: Omit<OpsDocumentLog, "id">): OpsDocumentLog {
  const log: OpsDocumentLog = {
    ...input,
    id: `odl-${Date.now()}`,
  };
  DOCUMENT_LOGS.unshift(log);
  return log;
}
