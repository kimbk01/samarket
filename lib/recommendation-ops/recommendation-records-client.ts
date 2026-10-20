"use client";

/**
 * 추천 기록 — 관리자 화면 fetch (서버 페이지·요약·건별 쓰기). 묶음 전체 GET/PUT 없음.
 */
import { adminFirstLoadFailure, adminSafeErrorCode } from "@/lib/admin/admin-load-failure";
import { loadRecommendationAnalyticsFromServer } from "@/lib/recommendation-analytics/recommendation-analytics-sync-client";
import { loadRecommendationExperimentsFromServer } from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { RecommendationAutomationExecution } from "@/lib/types/recommendation-automation";
import type {
  IncidentStatus,
  RecommendationAlertEvent,
  RecommendationIncident,
} from "@/lib/types/recommendation-monitoring";
import {
  parseRecommendationRecordsPage,
  parseRecommendationRecordsSummary,
  type RecommendationAutomationExecutionInput,
  type RecommendationRecordsPage,
} from "@/lib/recommendation-ops/recommendation-records-contract";
import { setRecommendationRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-summary-state";

const BASE = "/api/admin/recommendation-records";

export type RecordsFetchResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; httpStatus?: number };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

async function getPage<T>(path: string, params: Record<string, string | number | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  }
  try {
    const res = await fetch(`${BASE}/${path}?${qs.toString()}`, { cache: "no-store" });
    const j = await readJson(res);
    const page = parseRecommendationRecordsPage<T>(j);
    if (!res.ok || j.ok !== true || !page) {
      return { ok: false, error: adminSafeErrorCode(j.error as string | undefined, "load_failed"), httpStatus: res.status } as const;
    }
    return { ok: true, value: page } as const;
  } catch {
    return { ok: false, error: "network_error" } as const;
  }
}

export function fetchRecommendationIncidentsPage(q: {
  status?: IncidentStatus | "";
  surface?: RecommendationSurface | "";
  limit: number;
  offset: number;
}): Promise<RecordsFetchResult<RecommendationRecordsPage<RecommendationIncident>>> {
  return getPage<RecommendationIncident>("incidents", q);
}

export function fetchRecommendationAlertEventsPage(q: {
  status?: "ack" | "unack" | "";
  surface?: RecommendationSurface | "";
  limit: number;
  offset: number;
}): Promise<RecordsFetchResult<RecommendationRecordsPage<RecommendationAlertEvent>>> {
  return getPage<RecommendationAlertEvent>("alert-events", q);
}

export function fetchRecommendationAutomationExecutionsPage(q: {
  surface?: RecommendationSurface | "";
  actionType?: string;
  limit: number;
  offset: number;
}): Promise<RecordsFetchResult<RecommendationRecordsPage<RecommendationAutomationExecution>>> {
  return getPage<RecommendationAutomationExecution>("automation-executions", q);
}

async function send(
  method: "POST" | "PATCH",
  path: string,
  body: unknown
): Promise<{ ok: boolean; error?: string; httpStatus?: number; json?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await readJson(res);
    if (!res.ok || j.ok !== true) {
      return { ok: false, error: adminSafeErrorCode(j.error as string | undefined, "save_failed"), httpStatus: res.status };
    }
    return { ok: true, json: j };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export function acknowledgeRecommendationIncident(id: string) {
  return send("PATCH", `incidents/${encodeURIComponent(id)}`, { action: "acknowledge" });
}

export function resolveRecommendationIncident(id: string) {
  return send("PATCH", `incidents/${encodeURIComponent(id)}`, { action: "resolve" });
}

export function acknowledgeRecommendationAlertEvent(id: string) {
  return send("PATCH", `alert-events/${encodeURIComponent(id)}`, { action: "acknowledge" });
}

export function recordRecommendationAutomationExecution(execution: RecommendationAutomationExecutionInput) {
  return send("POST", "automation-executions", { execution });
}

/** 요약 RPC 결과를 요약 스냅샷에 넣는다. 실패면 스냅샷을 바꾸지 않고 실패를 돌려준다. */
export async function loadRecommendationRecordsSummaryFromServer(): Promise<{
  ok: boolean;
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch(`${BASE}/summary`, { cache: "no-store" });
    const j = await readJson(res);
    const summary = parseRecommendationRecordsSummary(j.summary);
    if (!res.ok || j.ok !== true || !summary) {
      return { ok: false, error: adminSafeErrorCode(j.error as string | undefined, "load_failed"), httpStatus: res.status };
    }
    setRecommendationRecordsSummary(summary);
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

type LoadResult = { ok: boolean; error?: string; httpStatus?: number };

function combine(results: LoadResult[]): LoadResult {
  const first = adminFirstLoadFailure(results);
  return first ? { ok: false, error: first.code, httpStatus: first.httpStatus } : { ok: true };
}

/** 추천 분석·보고서 화면: 분석 번들(리포트·섹션 헬스 등) + 기록 요약(노출 집계·실행/이슈 수). */
export async function loadRecommendationAnalyticsWithRecordsSummary(): Promise<LoadResult> {
  return combine(await Promise.all([loadRecommendationAnalyticsFromServer(), loadRecommendationRecordsSummaryFromServer()]));
}

/** 실험·배포 화면: 실험 번들 + 기록 요약(실험 버전별 노출 집계). */
export async function loadRecommendationExperimentsWithRecordsSummary(): Promise<LoadResult> {
  return combine(await Promise.all([loadRecommendationExperimentsFromServer(), loadRecommendationRecordsSummaryFromServer()]));
}
