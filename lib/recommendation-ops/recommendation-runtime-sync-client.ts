"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { RecommendationRuntimeBundleV1 } from "@/lib/recommendation-ops/recommendation-runtime-state";
import {
  exportRecommendationRuntimeBundle,
  importRecommendationRuntimeBundle,
} from "@/lib/recommendation-ops/recommendation-runtime-state";

export async function loadRecommendationRuntimeFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-runtime", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: RecommendationRuntimeBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importRecommendationRuntimeBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistRecommendationRuntimeToServer(): Promise<{
  ok: boolean;
  error?: string;
  httpStatus?: number;
}> {
  try {
    const bundle = exportRecommendationRuntimeBundle();
    const res = await fetch("/api/admin/recommendation-runtime", {
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
export async function commitRecommendationRuntimeChange(
  mutate: () => void
): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  const before = exportRecommendationRuntimeBundle();
  mutate();
  const r = await persistRecommendationRuntimeToServer();
  if (!r.ok) importRecommendationRuntimeBundle(before);
  return r;
}
