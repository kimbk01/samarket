import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STARTUP_CONFIG_SETTINGS_KEY,
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

export async function loadStartupConfigFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; config: StartupConfig; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STARTUP_CONFIG_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const raw = (data as { value_json?: unknown } | null)?.value_json;
  if (raw == null) {
    // Migrate-read: fall back to legacy cold_boot_intro_v1 if present.
    const legacy = await sb
      .from("admin_settings")
      .select("value_json")
      .eq("key", "cold_boot_intro_v1")
      .maybeSingle();
    const legacyRaw = (legacy.data as { value_json?: unknown } | null)?.value_json;
    if (legacyRaw != null) {
      return { ok: true, config: normalizeStartupConfig(legacyRaw), source: "db" };
    }
    return { ok: true, config: { ...BUNDLED_STARTUP_CONFIG }, source: "default" };
  }
  return { ok: true, config: normalizeStartupConfig(raw), source: "db" };
}

export async function saveStartupConfigToDb(
  sb: SupabaseClient,
  config: StartupConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const previous = await loadStartupConfigFromDb(sb);
  const prevVersion =
    previous.ok && previous.source === "db" ? previous.config.version : BUNDLED_STARTUP_CONFIG.version;
  const next = normalizeStartupConfig({
    ...config,
    version: Math.max(2, prevVersion + 1),
    updatedAt: new Date().toISOString(),
  });
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: STARTUP_CONFIG_SETTINGS_KEY,
      value_json: { payload: next, updated_at: next.updatedAt },
      updated_at: next.updatedAt,
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
