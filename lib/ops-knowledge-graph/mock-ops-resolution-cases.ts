/**
 * 42단계: 해결 사례 mock (incident + document + runbook 연계)
 */

import type { OpsResolutionCase, OpsResolutionOutcomeType } from "@/lib/types/ops-knowledge-graph";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";
import { getOpsRunbookResults } from "@/lib/ops-runbooks/mock-ops-runbook-results";

const CASES: OpsResolutionCase[] = [];
let initialized = false;

function buildCases(): void {
  if (initialized) return;
  initialized = true;
  const execs = getOpsRunbookExecutions({ status: "completed", limit: 20 });

  for (const e of execs) {
    const results = getOpsRunbookResults(e.id);
    const outcome = (results[0]?.outcomeType ?? "resolved") as OpsResolutionOutcomeType;
    CASES.push({
      id: `okrc-${e.id}`,
      incidentId: e.linkedId ?? e.linkedType,
      primaryDocumentId: e.documentId,
      relatedRunbookExecutionId: e.id,
      outcomeType: outcome,
      effectivenessScore: 0.85,
      createdAt: e.completedAt ?? e.updatedAt,
      note: results[0]?.summary ?? e.resultNote ?? "",
    });
  }

  CASES.push({
    id: "okrc-inc-1",
    incidentId: "inc-1",
    primaryDocumentId: "od-1",
    relatedRunbookExecutionId: null,
    outcomeType: "resolved",
    effectivenessScore: 0.9,
    createdAt: new Date().toISOString(),
    note: "Fallback 대응 플레이북 적용",
  });

  CASES.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getOpsResolutionCases(filters?: {
  incidentId?: string;
  documentId?: string;
  limit?: number;
}): OpsResolutionCase[] {
  buildCases();
  let list = [...CASES];
  if (filters?.incidentId) list = list.filter((c) => c.incidentId === filters.incidentId);
  if (filters?.documentId) list = list.filter((c) => c.primaryDocumentId === filters.documentId);
  const limit = filters?.limit ?? 30;
  return list.slice(0, limit);
}
