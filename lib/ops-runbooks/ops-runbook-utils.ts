/**
 * 40단계: 런북 실행 시작, 단계 진행, 결과 기록, 액션 placeholder
 */

import type { OpsRunbookLinkedType } from "@/lib/types/ops-runbook";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";
import { getOpsDocumentSteps } from "@/lib/ops-docs/mock-ops-document-steps";
import { addOpsRunbookExecution } from "./mock-ops-runbook-executions";
import { updateOpsRunbookExecution } from "./mock-ops-runbook-executions";
import { addOpsRunbookExecutionStep } from "./mock-ops-runbook-execution-steps";
import { updateOpsRunbookExecutionStep } from "./mock-ops-runbook-execution-steps";
import { getOpsRunbookExecutionSteps } from "./mock-ops-runbook-execution-steps";
import { addOpsRunbookResult } from "./mock-ops-runbook-results";
import { addOpsRunbookExecutionLog } from "./mock-ops-runbook-execution-logs";
import { addOpsActionItem } from "@/lib/ops-board/mock-ops-action-items";

/** active 문서만 실행 가능. 문서 단계 복제 후 실행 생성 */
export function startRunbookExecution(
  documentId: string,
  linkedType: OpsRunbookLinkedType,
  linkedId: string | null,
  adminId: string,
  adminNickname: string
): { executionId: string } | null {
  const doc = getOpsDocumentById(documentId);
  if (!doc || doc.status !== "active") return null;

  const docSteps = getOpsDocumentSteps(documentId);
  const now = new Date().toISOString();

  const exec = addOpsRunbookExecution({
    documentId,
    documentTitle: doc.title,
    documentType: doc.docType,
    linkedType,
    linkedId,
    executionStatus: "in_progress",
    startedAt: now,
    completedAt: null,
    startedByAdminId: adminId,
    startedByAdminNickname: adminNickname,
    summary: doc.summary,
    resultNote: "",
  });

  for (const s of docSteps) {
    addOpsRunbookExecutionStep({
      executionId: exec.id,
      sourceStepId: s.id,
      stepOrder: s.stepOrder,
      title: s.title,
      description: s.description,
      status: "pending",
      assignedAdminId: null,
      assignedAdminNickname: null,
      startedAt: null,
      completedAt: null,
      note: "",
      linkedType: s.linkedType,
      linkedId: s.linkedId,
    });
  }

  addOpsRunbookExecutionLog({
    executionId: exec.id,
    actionType: "start_execution",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    stepId: null,
    note: linkedId ? `${linkedType} ${linkedId} 연동` : "",
    createdAt: now,
  });

  return { executionId: exec.id };
}

/** 단계 상태 변경 + 로그 */
export function setRunbookStepStatus(
  stepId: string,
  status: "in_progress" | "done" | "skipped" | "blocked",
  adminId: string,
  adminNickname: string,
  note?: string
): boolean {
  const step = updateOpsRunbookExecutionStep(stepId, {
    status,
    assignedAdminId: adminId,
    assignedAdminNickname: adminNickname,
    ...(status === "in_progress" && { startedAt: new Date().toISOString() }),
    ...((status === "done" || status === "skipped") && { completedAt: new Date().toISOString() }),
    ...(note !== undefined && { note }),
  });
  if (!step) return false;

  const actionType =
    status === "in_progress"
      ? "start_step"
      : status === "done"
        ? "complete_step"
        : status === "skipped"
          ? "skip_step"
          : "block_step";

  addOpsRunbookExecutionLog({
    executionId: step.executionId,
      actionType,
      actorType: "admin",
      actorId: adminId,
      actorNickname: adminNickname,
      stepId: step.id,
      note: note ?? "",
    createdAt: new Date().toISOString(),
  });
  return true;
}

/** 실행 완료 처리 */
export function completeRunbookExecution(
  executionId: string,
  adminId: string,
  adminNickname: string,
  resultNote?: string
): boolean {
  const updated = updateOpsRunbookExecution(executionId, {
    executionStatus: "completed",
    completedAt: new Date().toISOString(),
    ...(resultNote !== undefined && { resultNote }),
  });
  if (!updated) return false;
  addOpsRunbookExecutionLog({
    executionId,
    actionType: "complete_execution",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    stepId: null,
    note: resultNote ?? "",
    createdAt: new Date().toISOString(),
  });
  return true;
}

/** 실행 중단 */
export function abortRunbookExecution(
  executionId: string,
  adminId: string,
  adminNickname: string,
  note: string
): boolean {
  const updated = updateOpsRunbookExecution(executionId, {
    executionStatus: "aborted",
    completedAt: new Date().toISOString(),
  });
  if (!updated) return false;
  addOpsRunbookExecutionLog({
    executionId,
    actionType: "abort_execution",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    stepId: null,
    note,
    createdAt: new Date().toISOString(),
  });
  return true;
}

/** 결과 기록 + followupNeeded 시 액션아이템 생성 placeholder */
export function writeRunbookResult(
  executionId: string,
  outcomeType: Parameters<typeof addOpsRunbookResult>[0]["outcomeType"],
  severityAfter: Parameters<typeof addOpsRunbookResult>[0]["severityAfter"],
  summary: string,
  rootCause: string,
  followupNeeded: boolean,
  adminId: string,
  adminNickname: string
): { resultId: string } {
  const now = new Date().toISOString();
  const result = addOpsRunbookResult({
    executionId,
    outcomeType,
    severityAfter,
    summary,
    rootCause,
    followupNeeded,
    createdByAdminId: adminId,
    createdByAdminNickname: adminNickname,
    createdAt: now,
  });

  addOpsRunbookExecutionLog({
    executionId,
    actionType: "write_result",
    actorType: "admin",
    actorId: adminId,
    actorNickname: adminNickname,
    stepId: null,
    note: summary,
    createdAt: now,
  });

  if (followupNeeded) {
    addOpsActionItem({
      title: `런북 후속 조치: ${summary.slice(0, 50)}`,
      description: summary,
      sourceType: "manual",
      sourceId: executionId,
      relatedSurface: "all",
      status: "open",
      priority: severityAfter === "critical" ? "critical" : severityAfter === "high" ? "high" : "medium",
      ownerAdminId: adminId,
      ownerAdminNickname: adminNickname,
      dueDate: null,
      note: `execution ${executionId}`,
    });
  }

  return { resultId: result.id };
}
