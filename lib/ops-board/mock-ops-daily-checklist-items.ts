/**
 * 38단계: 일일 점검 체크리스트 항목 mock
 */

import type {
  OpsDailyChecklistItem,
  OpsChecklistItemStatus,
} from "@/lib/types/ops-board";
import { getOpsChecklistTemplates } from "./mock-ops-checklist-templates";

const ITEMS: OpsDailyChecklistItem[] = [];

export function getOpsDailyChecklistItems(
  checklistDate: string
): OpsDailyChecklistItem[] {
  return ITEMS.filter((i) => i.checklistDate === checklistDate).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function getOpsDailyChecklistItemById(
  id: string
): OpsDailyChecklistItem | undefined {
  return ITEMS.find((i) => i.id === id);
}

export function addOpsDailyChecklistItem(
  input: Omit<OpsDailyChecklistItem, "id" | "createdAt" | "updatedAt">
): OpsDailyChecklistItem {
  const now = new Date().toISOString();
  const item: OpsDailyChecklistItem = {
    ...input,
    id: `odci-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  ITEMS.push(item);
  return item;
}

export function updateOpsDailyChecklistItem(
  id: string,
  update: Partial<Pick<OpsDailyChecklistItem, "status" | "assignedAdminId" | "assignedAdminNickname" | "checkedAt" | "note">>
): OpsDailyChecklistItem | null {
  const item = ITEMS.find((i) => i.id === id);
  if (!item) return null;
  const now = new Date().toISOString();
  if (update.status !== undefined) item.status = update.status;
  if (update.assignedAdminId !== undefined) item.assignedAdminId = update.assignedAdminId;
  if (update.assignedAdminNickname !== undefined) item.assignedAdminNickname = update.assignedAdminNickname;
  if (update.checkedAt !== undefined) item.checkedAt = update.checkedAt;
  if (update.note !== undefined) item.note = update.note;
  item.updatedAt = now;
  if (update.status === "done" && !item.checkedAt) item.checkedAt = now;
  return { ...item };
}

/** 템플릿 기준 당일 체크리스트 생성 (같은 날짜·같은 templateId 중복 방지) */
export function generateDailyChecklistFromTemplates(
  checklistDate: string,
  adminId: string,
  adminNickname: string
): OpsDailyChecklistItem[] {
  const existing = ITEMS.filter((i) => i.checklistDate === checklistDate);
  const existingTemplateIds = new Set(existing.map((e) => e.templateId));
  const templates = getOpsChecklistTemplates({ isActive: true });
  const created: OpsDailyChecklistItem[] = [];
  for (const t of templates) {
    if (existingTemplateIds.has(t.id)) continue;
    const item = addOpsDailyChecklistItem({
      checklistDate,
      templateId: t.id,
      title: t.title,
      category: t.category,
      surface: t.defaultSurface,
      status: "todo",
      priority: t.defaultPriority,
      assignedAdminId: adminId,
      assignedAdminNickname: adminNickname,
      checkedAt: null,
      note: "",
    });
    created.push(item);
    existingTemplateIds.add(t.id);
  }
  return created;
}
