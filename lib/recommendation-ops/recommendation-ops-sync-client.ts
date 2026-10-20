"use client";

import { adminFirstLoadFailure, adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { RecommendationOpsBundleV1 } from "@/lib/recommendation-ops/recommendation-ops-state";
import {
  exportRecommendationOpsBundle,
  importRecommendationOpsBundle,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import { loadRecommendationRecordsSummaryFromServer } from "@/lib/recommendation-ops/recommendation-records-client";
import { loadRecommendationExperimentsFromServer } from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";
import { loadRecommendationAnalyticsFromServer } from "@/lib/recommendation-analytics/recommendation-analytics-sync-client";

export async function loadRecommendationOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-ops", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: RecommendationOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importRecommendationOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistRecommendationOpsToServer(): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  try {
    const bundle = exportRecommendationOpsBundle();
    const res = await fetch("/api/admin/recommendation-ops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: adminSafeErrorCode(j.error, "save_failed"), httpStatus: res.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/**
 * 변경 1건 = 스냅샷 → 변경 → 서버 저장. 저장 실패면 화면 상태를 스냅샷으로 되돌린다 (R6 — 실패 무시 금지).
 */
export async function commitRecommendationOpsChange(
  mutate: () => void
): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  const before = exportRecommendationOpsBundle();
  mutate();
  const r = await persistRecommendationOpsToServer();
  if (!r.ok) importRecommendationOpsBundle(before);
  return r;
}

/**
 * 추천 운영 정책(ops) + 기록 요약(이슈·알림·실행·노출 집계 — DB 요약 RPC) + 실험 + 분석 번들을 한 번에 로드.
 * 기록 행 목록은 각 표가 서버 페이지로 따로 읽는다 (예전 runtime 묶음 전체 하이드레이트 제거 — R7 후속).
 */
export async function loadFullRecommendationAdminState(): Promise<{
  ok: boolean;
  errors?: string[];
  error?: string;
  httpStatus?: number;
  opsSource?: "db" | "default";
}> {
  const [ops, rt, exp, analytics] = await Promise.all([
    loadRecommendationOpsFromServer(),
    loadRecommendationRecordsSummaryFromServer(),
    loadRecommendationExperimentsFromServer(),
    loadRecommendationAnalyticsFromServer(),
  ]);
  const errors: string[] = [];
  if (!ops.ok) errors.push(ops.error ?? "ops_load_failed");
  if (!rt.ok) errors.push(rt.error ?? "records_summary_load_failed");
  if (!exp.ok) errors.push(exp.error ?? "experiments_load_failed");
  if (!analytics.ok) errors.push(analytics.error ?? "analytics_load_failed");
  const first = adminFirstLoadFailure([ops, rt, exp, analytics]);
  return {
    ok: ops.ok && rt.ok && exp.ok && analytics.ok,
    errors: errors.length ? errors : undefined,
    error: first?.code,
    httpStatus: first?.httpStatus,
    opsSource: ops.source,
  };
}
