"use client";

import type { RecommendationRuntimeBundleV1 } from "@/lib/recommendation-ops/recommendation-runtime-state";
import {
  exportRecommendationRuntimeBundle,
  importRecommendationRuntimeBundle,
} from "@/lib/recommendation-ops/recommendation-runtime-state";

export async function loadRecommendationRuntimeFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-runtime", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: RecommendationRuntimeBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importRecommendationRuntimeBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistRecommendationRuntimeToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportRecommendationRuntimeBundle();
    const res = await fetch("/api/admin/recommendation-runtime", {
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
