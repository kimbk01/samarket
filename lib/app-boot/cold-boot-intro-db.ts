import type { SupabaseClient } from "@supabase/supabase-js";
import {
  COLD_BOOT_INTRO_SETTINGS_KEY,
  DEFAULT_COLD_BOOT_INTRO_CONFIG,
  normalizeColdBootIntroConfig,
  type ColdBootIntroConfig,
} from "@/lib/app-boot/cold-boot-intro-config";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

export async function loadColdBootIntroConfigFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; config: ColdBootIntroConfig; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", COLD_BOOT_INTRO_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const raw = (data as { value_json?: unknown } | null)?.value_json;
  if (raw == null) {
    return { ok: true, config: { ...DEFAULT_COLD_BOOT_INTRO_CONFIG }, source: "default" };
  }
  return { ok: true, config: normalizeColdBootIntroConfig(raw), source: "db" };
}

export async function saveColdBootIntroConfigToDb(
  sb: SupabaseClient,
  config: ColdBootIntroConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const next = normalizeColdBootIntroConfig({
    ...config,
    updatedAt: new Date().toISOString(),
  });
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: COLD_BOOT_INTRO_SETTINGS_KEY,
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
