"use client";

import type { RecommendationOpsBundleV1 } from "@/lib/recommendation-ops/recommendation-ops-state";
import {
  exportRecommendationOpsBundle,
  importRecommendationOpsBundle,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import {
  loadRecommendationRuntimeFromServer,
  persistRecommendationRuntimeToServer,
} from "@/lib/recommendation-ops/recommendation-runtime-sync-client";

export { loadRecommendationRuntimeFromServer, persistRecommendationRuntimeToServer };

export async function loadRecommendationOpsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-ops", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: RecommendationOpsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importRecommendationOpsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistRecommendationOpsToServer(): Promise<{ ok: boolean; error?: string }> {
  try {
    const bundle = exportRecommendationOpsBundle();
    const res = await fetch("/api/admin/recommendation-ops", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "save_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

/** 추천 운영 정책(ops) + 런타임 이력(이슈·알림·실행)을 한 번에 로드 */
export async function loadFullRecommendationAdminState(): Promise<{
  ok: boolean;
  errors?: string[];
  opsSource?: "db" | "default";
  runtimeSource?: "db" | "default";
}> {
  const [ops, rt] = await Promise.all([
    loadRecommendationOpsFromServer(),
    loadRecommendationRuntimeFromServer(),
  ]);
  const errors: string[] = [];
  if (!ops.ok) errors.push(ops.error ?? "ops_load_failed");
  if (!rt.ok) errors.push(rt.error ?? "runtime_load_failed");
  return {
    ok: ops.ok && rt.ok,
    errors: errors.length ? errors : undefined,
    opsSource: ops.source,
    runtimeSource: rt.source,
  };
}
