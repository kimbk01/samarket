"use client";

import { adminSafeErrorCode } from "@/lib/admin/admin-load-failure";

import type { RecommendationAnalyticsBundleV1 } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import {
  exportRecommendationAnalyticsBundle,
  importRecommendationAnalyticsBundle,
} from "@/lib/recommendation-analytics/recommendation-analytics-state";

export async function loadRecommendationAnalyticsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
  httpStatus?: number;
}> {
  try {
    const res = await fetch("/api/admin/recommendation-analytics", { cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bundle?: RecommendationAnalyticsBundleV1;
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle) {
      return { ok: false, error: adminSafeErrorCode(j.error, "load_failed"), httpStatus: res.status };
    }
    importRecommendationAnalyticsBundle(j.bundle);
    return { ok: true, source: j.source };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

export async function persistRecommendationAnalyticsToServer(): Promise<{
  ok: boolean;
  error?: string;
  httpStatus?: number;
}> {
  try {
    const bundle = exportRecommendationAnalyticsBundle();
    const res = await fetch("/api/admin/recommendation-analytics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundle }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok: boolean; error?: string };
    if (!res.ok || !j.ok) {
      return { ok: false, error: adminSafeErrorCode(j.error, "save_failed"), httpStatus: res.status };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "network_error" };
  }
}
