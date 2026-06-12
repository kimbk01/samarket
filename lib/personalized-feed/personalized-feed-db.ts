import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalizedFeedLog, PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_FEED_BUNDLE_SETTINGS_KEY } from "@/lib/personalized-feed/personalized-feed-keys";
import { createDefaultPersonalizedFeedPolicies } from "@/lib/personalized-feed/personalized-feed-defaults";

export type PersonalizedFeedBundleV1 = {
  version: 1;
  policies: PersonalizedFeedPolicy[];
  logs: PersonalizedFeedLog[];
};

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): PersonalizedFeedBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.policies)) return null;
  return {
    version: 1,
    policies: o.policies as PersonalizedFeedPolicy[],
    logs: Array.isArray(o.logs) ? (o.logs as PersonalizedFeedLog[]) : [],
  };
}

export function createDefaultPersonalizedFeedBundle(): PersonalizedFeedBundleV1 {
  return {
    version: 1,
    policies: createDefaultPersonalizedFeedPolicies(),
    logs: [],
  };
}

export async function loadPersonalizedFeedBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: PersonalizedFeedBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", PERSONALIZED_FEED_BUNDLE_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, reason: "missing_table", message: error.message };
    return { ok: false, reason: "error", message: error.message };
  }

  const v = (data as { value_json?: unknown } | null)?.value_json;
  const inner =
    v && typeof v === "object" && "payload" in (v as object) ? (v as { payload?: unknown }).payload : v;
  const parsed = parseBundle(inner);
  if (!parsed) return { ok: true, bundle: createDefaultPersonalizedFeedBundle(), source: "default" };
  return { ok: true, bundle: parsed, source: "db" };
}

export async function savePersonalizedFeedBundleToDb(
  sb: SupabaseClient,
  bundle: PersonalizedFeedBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: bundle, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    { key: PERSONALIZED_FEED_BUNDLE_SETTINGS_KEY, value_json, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, error: "admin_settings 테이블이 없습니다." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function upsertPersonalizedFeedPolicy(
  bundle: PersonalizedFeedBundleV1,
  input: PersonalizedFeedPolicy
): PersonalizedFeedBundleV1 {
  const now = new Date().toISOString();
  const idx = bundle.policies.findIndex((p) => p.id === input.id || p.sectionKey === input.sectionKey);
  const next = { ...input, updatedAt: now };
  const policies =
    idx >= 0
      ? bundle.policies.map((p, i) => (i === idx ? { ...p, ...next } : p))
      : [...bundle.policies, { ...next, createdAt: now }];
  return { ...bundle, policies };
}
