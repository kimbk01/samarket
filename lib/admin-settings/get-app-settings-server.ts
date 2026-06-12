import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSettings } from "@/lib/types/admin-settings";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";
import {
  createDefaultAppSettingsBundle,
  loadAppSettingsBundleFromDb,
} from "@/lib/admin-settings/app-settings-db";

let cachedSettings: AppSettings | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

/** 서버(RSC·API) — DB 운영설정 (짧은 메모리 캐시) */
export async function getAppSettingsServer(sb: SupabaseClient): Promise<AppSettings> {
  const now = Date.now();
  if (cachedSettings && now - cachedAt < CACHE_TTL_MS) {
    return { ...cachedSettings };
  }
  const loaded = await loadAppSettingsBundleFromDb(sb);
  const settings = loaded.ok ? loaded.bundle.settings : createDefaultAppSettingsBundle().settings;
  cachedSettings = { ...DEFAULT_APP_SETTINGS, ...settings };
  cachedAt = now;
  return { ...cachedSettings };
}

export function invalidateAppSettingsServerCache(): void {
  cachedSettings = null;
  cachedAt = 0;
}
