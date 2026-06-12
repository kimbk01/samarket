import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCTION_MIGRATION_SETTINGS_KEY } from "@/lib/production-migration/production-migration-keys";
import type { ProductionMigrationBundleV1 } from "@/lib/production-migration/production-migration-state";
import { createDefaultProductionMigrationBundle } from "@/lib/production-migration/production-migration-state";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): ProductionMigrationBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    o.version !== 1 ||
    !Array.isArray(o.tables) ||
    !Array.isArray(o.rlsChecks) ||
    !Array.isArray(o.infraChecks) ||
    !Array.isArray(o.launchChecks)
  ) {
    return null;
  }
  return o as ProductionMigrationBundleV1;
}

export async function loadProductionMigrationBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: ProductionMigrationBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", PRODUCTION_MIGRATION_SETTINGS_KEY)
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
    return {
      ok: true,
      bundle: createDefaultProductionMigrationBundle(),
      source: "default",
    };
  }
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveProductionMigrationBundleToDb(
  sb: SupabaseClient,
  bundle: ProductionMigrationBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const value_json = { payload: bundle, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: PRODUCTION_MIGRATION_SETTINGS_KEY,
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
