"use client";

import type { RecommendationAnalyticsBundleV1 } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import {
  exportRecommendationAnalyticsBundle,
  importRecommendationAnalyticsBundle,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";

export async function loadRecommendationAnalyticsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-analytics", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: RecommendationAnalyticsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importRecommendationAnalyticsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

export async function persistRecommendationAnalyticsToServer(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    const bundle = exportRecommendationAnalyticsBundle();
    const res = await fetch("/api/admin/recommendation-analytics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "save_failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}
