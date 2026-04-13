/**
 * `admin_settings` 에 피드 긴급 번들 영속화
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEED_EMERGENCY_SETTINGS_KEY } from "@/lib/feed-emergency/feed-emergency-keys";
import type { FeedEmergencyBundleV1 } from "@/lib/feed-emergency/feed-emergency-state";
import { createDefaultFeedEmergencyBundle } from "@/lib/feed-emergency/feed-emergency-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): FeedEmergencyBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.policies) || !Array.isArray(o.fallbackStates)) return null;
  return {
    version: 1,
    policies: o.policies as FeedEmergencyBundleV1["policies"],
    fallbackStates: o.fallbackStates as FeedEmergencyBundleV1["fallbackStates"],
    sectionOverrides: Array.isArray(o.sectionOverrides)
      ? (o.sectionOverrides as FeedEmergencyBundleV1["sectionOverrides"])
      : [],
    logs: Array.isArray(o.logs) ? (o.logs as FeedEmergencyBundleV1["logs"]) : [],
  };
}

export async function loadFeedEmergencyBundleFromDb(
  sb: SupabaseClient
): Promise<
  { ok: true; bundle: FeedEmergencyBundleV1; source: "db" | "default" } | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", FEED_EMERGENCY_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const v = (data as { value_json?: unknown } | null)?.value_json;
  const inner = v && typeof v === "object" && "payload" in (v as object)
    ? (v as { payload?: unknown }).payload
    : v;
  const parsed = parseBundle(inner);
  if (!parsed) {
    return { ok: true, bundle: createDefaultFeedEmergencyBundle(), source: "default" };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveFeedEmergencyBundleToDb(
  sb: SupabaseClient,
  bundle: FeedEmergencyBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = {
    payload: bundle,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: FEED_EMERGENCY_SETTINGS_KEY,
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
