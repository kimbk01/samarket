"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { RecommendationExperimentsBundleV1 } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import {
  exportRecommendationExperimentsBundle,
  importRecommendationExperimentsBundle,
} from "@/lib/recommendation-experiments/recommendation-experiments-state";

export async function loadRecommendationExperimentsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-experiments", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: RecommendationExperimentsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importRecommendationExperimentsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistRecommendationExperimentsToServer(): Promise<{
  ok: boolean;
  error?: string;
  httpStatus?: number;
}> {
  try {
    const bundle = exportRecommendationExperimentsBundle();
    const res = await fetch("/api/admin/recommendation-experiments", {
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
export async function commitRecommendationExperimentsChange(
  mutate: () => void
): Promise<{ ok: boolean; error?: string; httpStatus?: number }> {
  const before = exportRecommendationExperimentsBundle();
  mutate();
  const r = await persistRecommendationExperimentsToServer();
  if (!r.ok) importRecommendationExperimentsBundle(before);
  return r;
}

/** 홈 피드 실험용 — 공개 API로 클라이언트 상태 초기화 */
export async function hydrateRecommendationContextFromPublicApi(): Promise<{ ok: boolean }> {
  try {
    const res = await fetch("/api/feed/recommendation-context", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      feedVersions?: RecommendationExperimentsBundleV1["feedVersions"];
      experiments?: RecommendationExperimentsBundleV1["experiments"];
      activeFeedVersions?: RecommendationExperimentsBundleV1["activeFeedVersions"];
    };
    if (!res.ok || !j.ok) return { ok: false };
    const current = exportRecommendationExperimentsBundle();
    importRecommendationExperimentsBundle({
      ...current,
      feedVersions: j.feedVersions ?? current.feedVersions,
      experiments: j.experiments
        ? [
            ...current.experiments.filter((e) => !j.experiments!.some((r) => r.id === e.id)),
            ...j.experiments,
          ]
        : current.experiments,
      activeFeedVersions: j.activeFeedVersions ?? current.activeFeedVersions,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
