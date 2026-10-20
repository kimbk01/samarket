"use client";

import { adminFirstLoadFailure, adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { RecommendationOpsBundleV1 } from "@/lib/recommendation-ops/recommendation-ops-state";
import {
  exportRecommendationOpsBundle,
  importRecommendationOpsBundle,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import {
  loadRecommendationRuntimeFromServer,
  persistRecommendationRuntimeToServer,
} from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { loadRecommendationExperimentsFromServer } from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";
import { loadRecommendationAnalyticsFromServer } from "@/lib/recommendation-analytics/recommendation-analytics-sync-client";

export { loadRecommendationRuntimeFromServer, persistRecommendationRuntimeToServer };

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

/** 추천 운영 정책(ops) + 런타임 이력(이슈·알림·실행)을 한 번에 로드 */
export async function loadFullRecommendationAdminState(): Promise<{
  ok: boolean;
  errors?: string[];
  error?: string;
  httpStatus?: number;
  opsSource?: "db" | "default";
  runtimeSource?: "db" | "default";
}> {
  const [ops, rt, exp, analytics] = await Promise.all([
    loadRecommendationOpsFromServer(),
    loadRecommendationRuntimeFromServer(),
    loadRecommendationExperimentsFromServer(),
    loadRecommendationAnalyticsFromServer(),
  ]);
  const errors: string[] = [];
  if (!ops.ok) errors.push(ops.error ?? "ops_load_failed");
  if (!rt.ok) errors.push(rt.error ?? "runtime_load_failed");
  if (!exp.ok) errors.push(exp.error ?? "experiments_load_failed");
  if (!analytics.ok) errors.push(analytics.error ?? "analytics_load_failed");
  const first = adminFirstLoadFailure([ops, rt, exp, analytics]);
  return {
    ok: ops.ok && rt.ok && exp.ok && analytics.ok,
    errors: errors.length ? errors : undefined,
    error: first?.code,
    httpStatus: first?.httpStatus,
    opsSource: ops.source,
    runtimeSource: rt.source,
  };
}
