/**
 * 운영 보드 — 체크리스트 템플릿·일일 점검·액션아이템·회고 단일 저장소.
 * 영속화: `ops-board-db` + `/api/admin/ops-board`
 */
import type {
  OpsChecklistTemplate,
  OpsChecklistCategory,
  OpsSurface,
  OpsChecklistPriority,
  OpsDailyChecklistItem,
  OpsActionItem,
  OpsActionStatus,
  OpsActionSourceType,
  OpsRetrospective,
} from "@/lib/types/ops-board";

function isoNow() {
  return new Date().toISOString();
}

function defaultChecklistTemplates(): OpsChecklistTemplate[] {
  const t = isoNow();
  return [
    {
      id: "oct-1",
      title: "추천 헬스 확인",
      category: "monitoring",
      defaultSurface: "all",
      defaultPriority: "high",
      isActive: true,
      sortOrder: 1,
      createdAt: t,
      updatedAt: t,
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
      createdAt: t,
      updatedAt: t,
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
      createdAt: t,
      updatedAt: t,
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
      createdAt: t,
      updatedAt: t,
      adminMemo: "",
    },
  ];
}

function defaultDailyChecklistItems(): OpsDailyChecklistItem[] {
  return [];
}

function defaultActionItems(): OpsActionItem[] {
  const now = isoNow();
  return [
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
      createdAt: now,
      updatedAt: now,
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
      updatedAt: now,
      resolvedAt: null,
      note: "",
    },
  ];
}

function defaultRetrospectives(): OpsRetrospective[] {
  const now = isoNow();
  return [
    {
      id: "opr-1",
      retrospectiveDate: now.slice(0, 10),
      title: "주간 운영 회고",
      summary: "추천 피드 안정 운영, 일부 이슈 대응 완료.",
      wins: "홈 CTR 유지, Fallback 미발생",
      issues: "검색 빈피드율 일시 상승",
      learnings: "모니터링 알림 임계치 조정 검토",
      nextActions: "빈피드 임계치 검토; 액션아이템 생성",
      relatedSurface: "all",
      relatedReportId: "rr-1",
      createdAt: now,
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

const CHECKLIST_TEMPLATES: OpsChecklistTemplate[] = defaultChecklistTemplates();
const DAILY_CHECKLIST_ITEMS: OpsDailyChecklistItem[] = defaultDailyChecklistItems();
const ACTION_ITEMS: OpsActionItem[] = defaultActionItems();
const RETROSPECTIVES: OpsRetrospective[] = defaultRetrospectives();

export type OpsBoardBundleV1 = {
  version: 1;
  checklistTemplates: OpsChecklistTemplate[];
  dailyChecklistItems: OpsDailyChecklistItem[];
  actionItems: OpsActionItem[];
  retrospectives: OpsRetrospective[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsBoardBundle(): OpsBoardBundleV1 {
  return {
    version: 1,
    checklistTemplates: defaultChecklistTemplates().map((t) => ({ ...t })),
    dailyChecklistItems: defaultDailyChecklistItems().map((i) => ({ ...i })),
    actionItems: defaultActionItems().map((a) => ({ ...a })),
    retrospectives: defaultRetrospectives().map((r) => ({ ...r })),
  };
}

export function importOpsBoardBundle(bundle: OpsBoardBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    CHECKLIST_TEMPLATES,
    (bundle.checklistTemplates ?? []).map((t) => ({ ...t }))
  );
  replaceArray(
    DAILY_CHECKLIST_ITEMS,
    (bundle.dailyChecklistItems ?? []).map((i) => ({ ...i }))
  );
  replaceArray(ACTION_ITEMS, (bundle.actionItems ?? []).map((a) => ({ ...a })));
  replaceArray(RETROSPECTIVES, (bundle.retrospectives ?? []).map((r) => ({ ...r })));
  if (!CHECKLIST_TEMPLATES.length)
    replaceArray(CHECKLIST_TEMPLATES, defaultChecklistTemplates());
  if (!ACTION_ITEMS.length) replaceArray(ACTION_ITEMS, defaultActionItems());
  if (!RETROSPECTIVES.length) replaceArray(RETROSPECTIVES, defaultRetrospectives());
}

export function exportOpsBoardBundle(): OpsBoardBundleV1 {
  return {
    version: 1,
    checklistTemplates: CHECKLIST_TEMPLATES.map((t) => ({ ...t })),
    dailyChecklistItems: DAILY_CHECKLIST_ITEMS.map((i) => ({ ...i })),
    actionItems: ACTION_ITEMS.map((a) => ({ ...a })),
    retrospectives: RETROSPECTIVES.map((r) => ({ ...r })),
  };
}

/* ─── checklist templates ───────────────────────────────────── */

export function getOpsChecklistTemplates(filters?: {
  category?: OpsChecklistCategory;
  isActive?: boolean;
}): OpsChecklistTemplate[] {
  let list = [...CHECKLIST_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.category) list = list.filter((t) => t.category === filters.category);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getOpsChecklistTemplateById(
  id: string
): OpsChecklistTemplate | undefined {
  return CHECKLIST_TEMPLATES.find((t) => t.id === id);
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
  const now = isoNow();
  const existing = input.id ? CHECKLIST_TEMPLATES.find((t) => t.id === input.id) : undefined;
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
    sortOrder: input.sortOrder ?? CHECKLIST_TEMPLATES.length,
    createdAt: now,
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  CHECKLIST_TEMPLATES.push(template);
  return template;
}

/* ─── daily checklist items ─────────────────────────────────── */

export function getOpsDailyChecklistItems(
  checklistDate: string
): OpsDailyChecklistItem[] {
  return DAILY_CHECKLIST_ITEMS.filter((i) => i.checklistDate === checklistDate).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function getOpsDailyChecklistItemById(
  id: string
): OpsDailyChecklistItem | undefined {
  return DAILY_CHECKLIST_ITEMS.find((i) => i.id === id);
}

export function addOpsDailyChecklistItem(
  input: Omit<OpsDailyChecklistItem, "id" | "createdAt" | "updatedAt">
): OpsDailyChecklistItem {
  const now = isoNow();
  const item: OpsDailyChecklistItem = {
    ...input,
    id: `odci-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  DAILY_CHECKLIST_ITEMS.push(item);
  return item;
}

export function updateOpsDailyChecklistItem(
  id: string,
  update: Partial<
    Pick<
      OpsDailyChecklistItem,
      "status" | "assignedAdminId" | "assignedAdminNickname" | "checkedAt" | "note"
    >
  >
): OpsDailyChecklistItem | null {
  const item = DAILY_CHECKLIST_ITEMS.find((i) => i.id === id);
  if (!item) return null;
  const now = isoNow();
  if (update.status !== undefined) item.status = update.status;
  if (update.assignedAdminId !== undefined) item.assignedAdminId = update.assignedAdminId;
  if (update.assignedAdminNickname !== undefined)
    item.assignedAdminNickname = update.assignedAdminNickname;
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
  const existing = DAILY_CHECKLIST_ITEMS.filter((i) => i.checklistDate === checklistDate);
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

/* ─── action items ──────────────────────────────────────────── */

export function getOpsActionItems(filters?: {
  status?: OpsActionStatus;
  sourceType?: OpsActionSourceType;
  relatedSurface?: string;
  limit?: number;
}): OpsActionItem[] {
  let list = [...ACTION_ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status) list = list.filter((a) => a.status === filters.status);
  if (filters?.sourceType) list = list.filter((a) => a.sourceType === filters.sourceType);
  if (filters?.relatedSurface)
    list = list.filter(
      (a) => a.relatedSurface === filters.relatedSurface || a.relatedSurface === "all"
    );
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsActionItemById(id: string): OpsActionItem | undefined {
  return ACTION_ITEMS.find((a) => a.id === id);
}

export function addOpsActionItem(
  input: Omit<OpsActionItem, "id" | "createdAt" | "updatedAt" | "resolvedAt">
): OpsActionItem {
  const now = isoNow();
  const action: OpsActionItem = {
    ...input,
    id: `oai-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  ACTION_ITEMS.unshift(action);
  return action;
}

export function updateOpsActionItem(
  id: string,
  update: Partial<
    Pick<
      OpsActionItem,
      "status" | "priority" | "ownerAdminId" | "ownerAdminNickname" | "dueDate" | "note" | "resolvedAt"
    >
  >
): OpsActionItem | null {
  const a = ACTION_ITEMS.find((x) => x.id === id);
  if (!a) return null;
  const now = isoNow();
  Object.assign(a, update, { updatedAt: now });
  if (update?.status === "done" || update?.status === "archived")
    a.resolvedAt = a.resolvedAt ?? now;
  return { ...a };
}

export function getOverdueActionItems(): OpsActionItem[] {
  const today = new Date().toISOString().slice(0, 10);
  return ACTION_ITEMS.filter(
    (a) =>
      a.dueDate &&
      a.dueDate < today &&
      a.status !== "done" &&
      a.status !== "archived"
  );
}

/* ─── retrospectives ────────────────────────────────────────── */

export function getOpsRetrospectives(filters?: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
}): OpsRetrospective[] {
  let list = [...RETROSPECTIVES].sort(
    (a, b) => new Date(b.retrospectiveDate).getTime() - new Date(a.retrospectiveDate).getTime()
  );
  if (filters?.fromDate)
    list = list.filter((r) => r.retrospectiveDate >= filters.fromDate!);
  if (filters?.toDate)
    list = list.filter((r) => r.retrospectiveDate <= filters.toDate!);
  const limit = filters?.limit ?? 50;
  return list.slice(0, limit);
}

export function getOpsRetrospectiveById(
  id: string
): OpsRetrospective | undefined {
  return RETROSPECTIVES.find((r) => r.id === id);
}

export function addOpsRetrospective(
  input: Omit<OpsRetrospective, "id">
): OpsRetrospective {
  const retro: OpsRetrospective = {
    ...input,
    id: `opr-${Date.now()}`,
  };
  RETROSPECTIVES.unshift(retro);
  return retro;
}

export function updateOpsRetrospective(
  id: string,
  update: Partial<
    Omit<OpsRetrospective, "id" | "createdAt" | "createdByAdminId" | "createdByAdminNickname">
  >
): OpsRetrospective | null {
  const r = RETROSPECTIVES.find((x) => x.id === id);
  if (!r) return null;
  Object.assign(r, update);
  return { ...r };
}
