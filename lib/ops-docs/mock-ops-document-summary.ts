/**
 * 39단계: 문서 요약 mock
 */

import type { OpsDocumentSummary } from "@/lib/types/ops-docs";
import { getOpsDocuments } from "./mock-ops-documents";

export function getOpsDocumentSummary(): OpsDocumentSummary {
  const all = getOpsDocuments({ limit: 1000 });
  const totalDocuments = all.length;
  const totalActive = all.filter((d) => d.status === "active").length;
  const totalDraft = all.filter((d) => d.status === "draft").length;
  const totalArchived = all.filter((d) => d.status === "archived").length;
  const totalPinned = all.filter((d) => d.isPinned).length;
  const sorted = [...all].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const latestUpdatedAt = sorted[0]?.updatedAt ?? null;

  return {
    totalDocuments,
    totalActive,
    totalDraft,
    totalArchived,
    totalPinned,
    latestUpdatedAt,
  };
}
