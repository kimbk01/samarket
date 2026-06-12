/**
 * 운영 지식베이스 — 검색·추천 로그·최근 열람 단일 저장소.
 * 영속화: `ops-knowledge-db` + `/api/admin/ops-knowledge`
 */
import type {
  OpsKnowledgeSearchLog,
  OpsKnowledgeRecommendationLog,
  OpsKnowledgeRecommendSourceType,
  OpsKnowledgeRecentView,
} from "@/lib/types/ops-knowledge";
import { invalidateOpsKnowledgeIndexCache } from "@/lib/ops-knowledge/ops-knowledge-base-index";

const MAX_LOGS = 300;

function defaultSearchLogs(): OpsKnowledgeSearchLog[] {
  return [
    {
      id: "oksl-1",
      adminId: "admin1",
      adminNickname: "관리자",
      query: "fallback",
      filters: {},
      resultCount: 2,
      clickedDocumentId: "od-1",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "oksl-2",
      adminId: "admin1",
      adminNickname: "관리자",
      query: "롤백",
      filters: { category: "rollback" },
      resultCount: 1,
      clickedDocumentId: "od-3",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
}

function defaultRecommendationLogs(): OpsKnowledgeRecommendationLog[] {
  return [
    {
      id: "okrl-1",
      sourceType: "incident",
      sourceId: "inc-1",
      recommendedDocumentId: "od-1",
      recommendationReason: "category: incident_response, tag: fallback",
      score: 0.95,
      clicked: true,
      clickedAt: new Date(Date.now() - 3600000).toISOString(),
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "okrl-2",
      sourceType: "rollback",
      sourceId: null,
      recommendedDocumentId: "od-3",
      recommendationReason: "category: rollback",
      score: 0.9,
      clicked: false,
      clickedAt: null,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ];
}

function defaultRecentViews(): OpsKnowledgeRecentView[] {
  return [
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
}

const SEARCH_LOGS: OpsKnowledgeSearchLog[] = defaultSearchLogs();
const RECOMMENDATION_LOGS: OpsKnowledgeRecommendationLog[] = defaultRecommendationLogs();
const RECENT_VIEWS: OpsKnowledgeRecentView[] = defaultRecentViews();

export type OpsKnowledgeBundleV1 = {
  version: 1;
  searchLogs: OpsKnowledgeSearchLog[];
  recommendationLogs: OpsKnowledgeRecommendationLog[];
  recentViews: OpsKnowledgeRecentView[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

function trimLogs<T>(arr: T[], max: number) {
  while (arr.length > max) arr.pop();
}

export function createDefaultOpsKnowledgeBundle(): OpsKnowledgeBundleV1 {
  return {
    version: 1,
    searchLogs: defaultSearchLogs().map((l) => ({ ...l })),
    recommendationLogs: defaultRecommendationLogs().map((l) => ({ ...l })),
    recentViews: defaultRecentViews().map((v) => ({ ...v })),
  };
}

export function importOpsKnowledgeBundle(bundle: OpsKnowledgeBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    SEARCH_LOGS,
    (bundle.searchLogs ?? []).map((l) => ({ ...l })).slice(0, MAX_LOGS)
  );
  replaceArray(
    RECOMMENDATION_LOGS,
    (bundle.recommendationLogs ?? []).map((l) => ({ ...l })).slice(0, MAX_LOGS)
  );
  replaceArray(
    RECENT_VIEWS,
    (bundle.recentViews ?? []).map((v) => ({ ...v }))
  );
  if (!SEARCH_LOGS.length) replaceArray(SEARCH_LOGS, defaultSearchLogs());
  if (!RECOMMENDATION_LOGS.length)
    replaceArray(RECOMMENDATION_LOGS, defaultRecommendationLogs());
  if (!RECENT_VIEWS.length) replaceArray(RECENT_VIEWS, defaultRecentViews());
  invalidateOpsKnowledgeIndexCache();
}

export function exportOpsKnowledgeBundle(): OpsKnowledgeBundleV1 {
  return {
    version: 1,
    searchLogs: SEARCH_LOGS.map((l) => ({ ...l })),
    recommendationLogs: RECOMMENDATION_LOGS.map((l) => ({ ...l })),
    recentViews: RECENT_VIEWS.map((v) => ({ ...v })),
  };
}

/* ─── search logs ───────────────────────────────────────────── */

export function getOpsKnowledgeSearchLogs(options?: {
  limit?: number;
  adminId?: string;
}): OpsKnowledgeSearchLog[] {
  let list = [...SEARCH_LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (options?.adminId) list = list.filter((l) => l.adminId === options.adminId);
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsKnowledgeSearchLog(
  input: Omit<OpsKnowledgeSearchLog, "id" | "createdAt">
): OpsKnowledgeSearchLog {
  const log: OpsKnowledgeSearchLog = {
    ...input,
    id: `oksl-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  SEARCH_LOGS.unshift(log);
  trimLogs(SEARCH_LOGS, MAX_LOGS);
  return log;
}

export function updateOpsKnowledgeSearchLogClick(
  logId: string,
  clickedDocumentId: string
): void {
  const log = SEARCH_LOGS.find((l) => l.id === logId);
  if (log) log.clickedDocumentId = clickedDocumentId;
}

/* ─── recommendation logs ───────────────────────────────────── */

export function getOpsKnowledgeRecommendationLogs(options?: {
  limit?: number;
  sourceType?: OpsKnowledgeRecommendSourceType;
}): OpsKnowledgeRecommendationLog[] {
  let list = [...RECOMMENDATION_LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (options?.sourceType) list = list.filter((l) => l.sourceType === options.sourceType);
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsKnowledgeRecommendationLog(
  input: Omit<OpsKnowledgeRecommendationLog, "id" | "createdAt">
): OpsKnowledgeRecommendationLog {
  const log: OpsKnowledgeRecommendationLog = {
    ...input,
    id: `okrl-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  RECOMMENDATION_LOGS.unshift(log);
  trimLogs(RECOMMENDATION_LOGS, MAX_LOGS);
  return log;
}

export function setOpsKnowledgeRecommendationLogClicked(logId: string): void {
  const log = RECOMMENDATION_LOGS.find((l) => l.id === logId);
  if (log) {
    log.clicked = true;
    log.clickedAt = new Date().toISOString();
  }
}

export function findRecommendationLog(
  sourceType: OpsKnowledgeRecommendSourceType,
  sourceId: string | null,
  recommendedDocumentId: string
): OpsKnowledgeRecommendationLog | undefined {
  return RECOMMENDATION_LOGS.find(
    (l) =>
      l.sourceType === sourceType &&
      l.sourceId === sourceId &&
      l.recommendedDocumentId === recommendedDocumentId
  );
}

/* ─── recent views ──────────────────────────────────────────── */

export function getOpsKnowledgeRecentViews(options?: {
  adminId?: string;
  limit?: number;
}): OpsKnowledgeRecentView[] {
  let list = [...RECENT_VIEWS].sort(
    (a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime()
  );
  if (options?.adminId) list = list.filter((v) => v.adminId === options.adminId);
  const limit = options?.limit ?? 20;
  return list.slice(0, limit);
}

export function addOpsKnowledgeRecentView(
  input: Omit<OpsKnowledgeRecentView, "id">
): OpsKnowledgeRecentView {
  const existing = RECENT_VIEWS.filter(
    (v) => v.adminId === input.adminId && v.documentId === input.documentId
  );
  existing.forEach((v) => {
    const i = RECENT_VIEWS.indexOf(v);
    if (i !== -1) RECENT_VIEWS.splice(i, 1);
  });
  const view: OpsKnowledgeRecentView = {
    ...input,
    id: `okrv-${Date.now()}`,
  };
  RECENT_VIEWS.unshift(view);
  return view;
}
