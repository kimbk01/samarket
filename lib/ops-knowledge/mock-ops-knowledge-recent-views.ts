/**
 * 41단계: 최근 열람 문서 mock
 */

import type {
  OpsKnowledgeRecentView,
  OpsKnowledgeRecentViewSourceType,
} from "@/lib/types/ops-knowledge";

const VIEWS: OpsKnowledgeRecentView[] = [
  {
    id: "okrv-1",
    adminId: "admin1",
    adminNickname: "관리자",
    documentId: "od-1",
    viewedAt: new Date(Date.now() - 3600000).toISOString(),
    sourceType: "search",
  },
  {
    id: "okrv-2",
    adminId: "admin1",
    adminNickname: "관리자",
    documentId: "od-3",
    viewedAt: new Date(Date.now() - 7200000).toISOString(),
    sourceType: "incident",
  },
  {
    id: "okrv-3",
    adminId: "admin1",
    adminNickname: "관리자",
    documentId: "od-2",
    viewedAt: new Date(Date.now() - 86400000).toISOString(),
    sourceType: "runbook",
  },
];

export function getOpsKnowledgeRecentViews(options?: {
  adminId?: string;
  limit?: number;
}): OpsKnowledgeRecentView[] {
  let list = [...VIEWS].sort(
    (a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime()
  );
  if (options?.adminId) list = list.filter((v) => v.adminId === options.adminId);
  const limit = options?.limit ?? 20;
  return list.slice(0, limit);
}

export function addOpsKnowledgeRecentView(
  input: Omit<OpsKnowledgeRecentView, "id">
): OpsKnowledgeRecentView {
  const existing = VIEWS.filter(
    (v) => v.adminId === input.adminId && v.documentId === input.documentId
  );
  existing.forEach((v) => {
    const i = VIEWS.indexOf(v);
    if (i !== -1) VIEWS.splice(i, 1);
  });
  const view: OpsKnowledgeRecentView = {
    ...input,
    id: `okrv-${Date.now()}`,
  };
  VIEWS.unshift(view);
  return view;
}
