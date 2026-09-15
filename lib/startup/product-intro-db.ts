import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUNDLED_PRODUCT_INTRO_CONFIG,
  STARTUP_PRODUCT_INTRO_SETTINGS_KEY,
  normalizeProductIntroConfig,
  type ProductIntroConfig,
} from "@/lib/startup/product-intro";

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

export async function loadProductIntroFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; config: ProductIntroConfig; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", STARTUP_PRODUCT_INTRO_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) {
      return { ok: false, reason: "missing_table", message: error.message };
    }
    return { ok: false, reason: "error", message: error.message };
  }

  const raw = (data as { value_json?: unknown } | null)?.value_json;
  if (raw == null) {
    return { ok: true, config: { ...BUNDLED_PRODUCT_INTRO_CONFIG }, source: "default" };
  }
  return { ok: true, config: normalizeProductIntroConfig(raw), source: "db" };
}

export async function saveProductIntroToDb(
  sb: SupabaseClient,
  config: ProductIntroConfig
): Promise<{ ok: true; config: ProductIntroConfig } | { ok: false; error: string }> {
  const previous = await loadProductIntroFromDb(sb);
  const prevVersion =
    previous.ok && previous.source === "db"
      ? previous.config.version
      : BUNDLED_PRODUCT_INTRO_CONFIG.version;
  const next = normalizeProductIntroConfig({
    ...config,
    version: Math.max(1, prevVersion + 1),
    updatedAt: new Date().toISOString(),
  });
  const { error } = await sb.from("admin_settings").upsert(
    {
      key: STARTUP_PRODUCT_INTRO_SETTINGS_KEY,
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
  return { ok: true, config: next };
}
