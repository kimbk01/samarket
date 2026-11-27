import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STARTUP_CONFIG_SETTINGS_KEY,
  BUNDLED_STARTUP_CONFIG,
  normalizeStartupConfig,
  type StartupConfig,
} from "@/lib/startup/startup-config";
import {
  invalidateAdminSettingSharedCache,
  readAdminSettingShared,
} from "@/lib/admin-settings/admin-setting-shared-cache.server";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

type StartupConfigLoad =
  | { ok: true; config: StartupConfig; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string };

function interpretStartupConfigRead(
  data: { value_json?: unknown } | null,
  error: { message?: string; code?: string } | null
): StartupConfigLoad {
  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const raw = data?.value_json;
  if (raw == null) {
    // cold_boot_intro_v1 and other Intro-shaped keys are NOT boot authority.
    return { ok: true, config: { ...BUNDLED_STARTUP_CONFIG }, source: "default" };
  }
  return { ok: true, config: normalizeStartupConfig(raw), source: "db" };
}

/** 캐시 없이 — 관리자 화면·저장(버전 계산) */
export async function loadStartupConfigFromDb(sb: SupabaseClient): Promise<StartupConfigLoad> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STARTUP_CONFIG_SETTINGS_KEY)
    .maybeSingle();
  return interpretStartupConfigRead(data as { value_json?: unknown } | null, error);
}

/** 공개 `/api/app/startup-config` — 인스턴스 공유 캐시(저장 시 즉시 만료). 공유 캐시 실패 시 `sb` 로 직접. */
export async function loadStartupConfigShared(sb: SupabaseClient): Promise<StartupConfigLoad> {
  const { data, error } = await readAdminSettingShared(STARTUP_CONFIG_SETTINGS_KEY, sb);
  return interpretStartupConfigRead(data, error);
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
      return { ok: false, error: "admin_settings_missing" };
    }
    return { ok: false, error: error.message };
  }
  invalidateAdminSettingSharedCache(STARTUP_CONFIG_SETTINGS_KEY);
  return { ok: true };
}
