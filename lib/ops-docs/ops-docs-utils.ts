/**
 * 39단계: 문서 slug 생성, 복제 placeholder, 로그 기록 연동
 */

import type { OpsDocStatus } from "@/lib/types/ops-docs";
import { getOpsDocumentById, addOpsDocument, updateOpsDocument } from "./mock-ops-documents";
import { getOpsDocumentSteps } from "./mock-ops-document-steps";
import { addOpsDocumentStep } from "./mock-ops-document-steps";
import { addOpsDocumentLog } from "./mock-ops-document-logs";
import type { OpsDocument } from "@/lib/types/ops-docs";

export function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/** 문서 복제 placeholder: 새 문서 + 단계 복사 후 create 로그 */
export function duplicateOpsDocument(
  documentId: string,
  newTitle: string,
  adminId: string,
  adminNickname: string
): { id: string } | null {
  const doc = getOpsDocumentById(documentId);
  if (!doc) return null;
  const steps = getOpsDocumentSteps(documentId);
  const { id: _omitId, createdAt: _ca, updatedAt: _ua, ...docRest } = doc;
  const newDoc = addOpsDocument({
    ...docRest,
    title: newTitle,
    slug: `${doc.slug}-copy-${Date.now()}`,
    status: "draft",
    versionLabel: "0.1",
    isPinned: false,
    createdByAdminId: adminId,
    createdByAdminNickname: adminNickname,
    approvedByAdminId: null,
    approvedByAdminNickname: null,
    adminMemo: `복제 from ${documentId}`,
  });
  for (const s of steps) {
    addOpsDocumentStep({
      documentId: newDoc.id,
      stepOrder: s.stepOrder,
      title: s.title,
      description: s.description,
      isRequired: s.isRequired,
      estimatedMinutes: s.estimatedMinutes,
      linkedType: s.linkedType,
      linkedId: s.linkedId,
    });
  }
  addOpsDocumentLog({
    documentId: newDoc.id,
    actionType: "duplicate",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    note: `from ${documentId}`,
    createdAt: newDoc.createdAt,
  });
  return { id: newDoc.id };
}

/** 상태 변경 + 로그 기록 */
export function setOpsDocumentStatusWithLog(
  documentId: string,
  status: OpsDocStatus,
  adminId: string,
  adminNickname: string
): OpsDocument | null {
  const doc = updateOpsDocument(documentId, { status });
  if (!doc) return null;
  const actionType = status === "archived" ? "archive" : status === "active" ? "activate" : "update";
  addOpsDocumentLog({
    documentId,
    actionType,
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    note: `상태 → ${status}`,
    createdAt: new Date().toISOString(),
  });
  return doc;
}
