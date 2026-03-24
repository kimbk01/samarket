/**
 * 38단계: 액션아이템 mock
 */

import type {
  OpsActionItem,
  OpsActionStatus,
  OpsActionSourceType,
} from "@/lib/types/ops-board";

const ACTIONS: OpsActionItem[] = [
  {
    id: "oai-1",
    title: "빈피드 임계치 검토",
    description: "검색 surface 빈피드율 알림 임계치 조정",
    sourceType: "retrospective",
    sourceId: "opr-1",
    relatedSurface: "all",
    status: "open",
    priority: "medium",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    note: "",
  },
  {
    id: "oai-2",
    title: "일간 점검 체크리스트 완료",
    description: "당일 체크리스트 전 항목 완료",
    sourceType: "checklist",
    sourceId: null,
    relatedSurface: "all",
    status: "in_progress",
    priority: "high",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    dueDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedAt: null,
    note: "",
  },
];

export function getOpsActionItems(filters?: {
  status?: OpsActionStatus;
  sourceType?: OpsActionSourceType;
  relatedSurface?: string;
  limit?: number;
}): OpsActionItem[] {
  let list = [...ACTIONS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status) list = list.filter((a) => a.status === filters.status);
  if (filters?.sourceType) list = list.filter((a) => a.sourceType === filters.sourceType);
  if (filters?.relatedSurface) list = list.filter((a) => a.relatedSurface === filters.relatedSurface || a.relatedSurface === "all");
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsActionItemById(id: string): OpsActionItem | undefined {
  return ACTIONS.find((a) => a.id === id);
}

export function addOpsActionItem(
  input: Omit<OpsActionItem, "id" | "createdAt" | "updatedAt" | "resolvedAt">
): OpsActionItem {
  const now = new Date().toISOString();
  const action: OpsActionItem = {
    ...input,
    id: `oai-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  ACTIONS.unshift(action);
  return action;
}

export function updateOpsActionItem(
  id: string,
  update: Partial<Pick<OpsActionItem, "status" | "priority" | "ownerAdminId" | "ownerAdminNickname" | "dueDate" | "note" | "resolvedAt">>
): OpsActionItem | null {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) return null;
  const now = new Date().toISOString();
  Object.assign(a, update, { updatedAt: now });
  if (update?.status === "done" || update?.status === "archived") a.resolvedAt = a.resolvedAt ?? now;
  return { ...a };
}

export function getOverdueActionItems(): OpsActionItem[] {
  const today = new Date().toISOString().slice(0, 10);
  return ACTIONS.filter(
    (a) =>
      a.dueDate &&
      a.dueDate < today &&
      a.status !== "done" &&
      a.status !== "archived"
  );
}
