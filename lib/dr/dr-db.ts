/**
 * `admin_settings` 에 DR 운영 번들 영속화
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DR_OPS_SETTINGS_KEY } from "@/lib/dr/dr-keys";
import type { DrOpsBundleV1 } from "@/lib/dr/dr-state";
import { createDefaultDrOpsBundle } from "@/lib/dr/dr-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): DrOpsBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.scenarios)) return null;
  return {
    version: 1,
    scenarios: o.scenarios as DrOpsBundleV1["scenarios"],
    steps: Array.isArray(o.steps) ? (o.steps as DrOpsBundleV1["steps"]) : [],
    executions: Array.isArray(o.executions)
      ? (o.executions as DrOpsBundleV1["executions"])
      : [],
  };
}

export async function loadDrOpsBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: DrOpsBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", DR_OPS_SETTINGS_KEY)
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
    return { ok: true, bundle: createDefaultDrOpsBundle(), source: "default" };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveDrOpsBundleToDb(
  sb: SupabaseClient,
  bundle: DrOpsBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = {
    payload: bundle,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: DR_OPS_SETTINGS_KEY,
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
