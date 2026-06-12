import type { SupabaseClient } from "@supabase/supabase-js";
import { RECOMMENDATION_ANALYTICS_SETTINGS_KEY } from "@/lib/recommendation-analytics/recommendation-analytics-keys";
import type { RecommendationAnalyticsBundleV1 } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { createDefaultRecommendationAnalyticsBundle } from "@/lib/recommendation-analytics/recommendation-analytics-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): RecommendationAnalyticsBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.impressions)) return null;
  return o as RecommendationAnalyticsBundleV1;
}

export async function loadRecommendationAnalyticsBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: RecommendationAnalyticsBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", RECOMMENDATION_ANALYTICS_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const v = (data as { value_json?: unknown } | null)?.value_json;
  const inner =
    v && typeof v === "object" && "payload" in (v as object)
      ? (v as { payload?: unknown }).payload
      : v;
  const parsed = parseBundle(inner);
  if (!parsed) {
    return { ok: true, bundle: createDefaultRecommendationAnalyticsBundle(), source: "default" };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveRecommendationAnalyticsBundleToDb(
  sb: SupabaseClient,
  bundle: RecommendationAnalyticsBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: bundle, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: RECOMMENDATION_ANALYTICS_SETTINGS_KEY,
      value_json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, error: "admin_settings 테이블이 없습니다." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
