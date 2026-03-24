/**
 * 38단계: 점검 체크리스트 템플릿 mock
 */

import type {
  OpsChecklistTemplate,
  OpsChecklistCategory,
  OpsSurface,
  OpsChecklistPriority,
} from "@/lib/types/ops-board";

const now = new Date().toISOString();

const TEMPLATES: OpsChecklistTemplate[] = [
  {
    id: "oct-1",
    title: "추천 헬스 확인",
    category: "monitoring",
    defaultSurface: "all",
    defaultPriority: "high",
    isActive: true,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    adminMemo: "",
  },
  {
    id: "oct-2",
    title: "피드 Fallback/Kill Switch 상태 확인",
    category: "feed",
    defaultSurface: "home",
    defaultPriority: "high",
    isActive: true,
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
    adminMemo: "",
  },
  {
    id: "oct-3",
    title: "미해결 이슈·알림 확인",
    category: "monitoring",
    defaultSurface: "all",
    defaultPriority: "medium",
    isActive: true,
    sortOrder: 3,
    createdAt: now,
    updatedAt: now,
    adminMemo: "",
  },
  {
    id: "oct-4",
    title: "일간 보고서 검토",
    category: "reports",
    defaultSurface: "all",
    defaultPriority: "medium",
    isActive: true,
    sortOrder: 4,
    createdAt: now,
    updatedAt: now,
    adminMemo: "",
  },
];

export function getOpsChecklistTemplates(filters?: {
  category?: OpsChecklistCategory;
  isActive?: boolean;
}): OpsChecklistTemplate[] {
  let list = [...TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.category) list = list.filter((t) => t.category === filters.category);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getOpsChecklistTemplateById(
  id: string
): OpsChecklistTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function saveOpsChecklistTemplate(
  input: Partial<OpsChecklistTemplate> & {
    id?: string;
    title: string;
    category: OpsChecklistCategory;
    defaultSurface: OpsSurface;
    defaultPriority: OpsChecklistPriority;
  }
): OpsChecklistTemplate {
  const now = new Date().toISOString();
  const existing = input.id ? TEMPLATES.find((t) => t.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const template: OpsChecklistTemplate = {
    id: input.id ?? `oct-${Date.now()}`,
    title: input.title,
    category: input.category,
    defaultSurface: input.defaultSurface,
    defaultPriority: input.defaultPriority,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? TEMPLATES.length,
    createdAt: now,
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  TEMPLATES.push(template);
  return template;
}
