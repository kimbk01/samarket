/**
 * 43단계: 학습 히스토리·패턴·품질 피드백 연계 유틸
 */

import { getOpsIssuePatternById } from "./mock-ops-issue-patterns";
import { getOpsImprovementSuggestions } from "./mock-ops-improvement-suggestions";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

/** 패턴에 연결된 문서/런북 문서/개선 제안 요약 */
export function getPatternConnections(patternId: string) {
  const pattern = getOpsIssuePatternById(patternId);
  if (!pattern) return null;
  const suggestions = getOpsImprovementSuggestions({ patternId });
  const doc = pattern.linkedDocumentId
    ? getOpsDocumentById(pattern.linkedDocumentId)
    : null;
  const runbookDoc = pattern.linkedRunbookDocumentId
    ? getOpsDocumentById(pattern.linkedRunbookDocumentId)
    : null;
  return {
    pattern,
    linkedDocument: doc,
    linkedRunbookDocument: runbookDoc,
    suggestions,
  };
}
