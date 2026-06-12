import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppSettings, SettingChangeLog } from "@/lib/types/admin-settings";
import { APP_SETTINGS_BUNDLE_KEY } from "@/lib/admin-settings/app-settings-keys";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";

export type AppSettingsBundleV1 = {
  version: 1;
  settings: AppSettings;
  changeLogs: SettingChangeLog[];
};

const MAX_LOGS = 300;

function isMissingAdminSettings(err: { message?: string; code?: string }): boolean {
  const m = (err.message ?? "").toLowerCase();
  return err.code === "42P01" || (m.includes("relation") && m.includes("admin_settings"));
}

function parseBundle(raw: unknown): AppSettingsBundleV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || o.settings == null || typeof o.settings !== "object") return null;
  return {
    version: 1,
    settings: o.settings as AppSettings,
    changeLogs: Array.isArray(o.changeLogs) ? (o.changeLogs as SettingChangeLog[]) : [],
  };
}

export function createDefaultAppSettingsBundle(): AppSettingsBundleV1 {
  return {
    version: 1,
    settings: { ...DEFAULT_APP_SETTINGS, updatedAt: new Date().toISOString() },
    changeLogs: [],
  };
}

export async function loadAppSettingsBundleFromDb(
  sb: SupabaseClient
): Promise<
  | { ok: true; bundle: AppSettingsBundleV1; source: "db" | "default" }
  | { ok: false; reason: "missing_table" | "error"; message?: string }
> {
  const { data, error } = await sb
    .from("admin_settings")
    .select("value_json")
    .eq("key", APP_SETTINGS_BUNDLE_KEY)
    .maybeSingle();

  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, reason: "missing_table", message: error.message };
    return { ok: false, reason: "error", message: error.message };
  }

  const v = (data as { value_json?: unknown } | null)?.value_json;
  const inner =
    v && typeof v === "object" && "payload" in (v as object) ? (v as { payload?: unknown }).payload : v;
  const parsed = parseBundle(inner);
  if (!parsed) return { ok: true, bundle: createDefaultAppSettingsBundle(), source: "default" };
  return { ok: true, bundle: parsed, source: "db" };
}

export async function saveAppSettingsBundleToDb(
  sb: SupabaseClient,
  bundle: AppSettingsBundleV1
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed: AppSettingsBundleV1 = {
    ...bundle,
    changeLogs: bundle.changeLogs.slice(0, MAX_LOGS),
  };
  const value_json = { payload: trimmed, updated_at: new Date().toISOString() };
  const { error } = await sb.from("admin_settings").upsert(
    { key: APP_SETTINGS_BUNDLE_KEY, value_json, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) {
    if (isMissingAdminSettings(error)) return { ok: false, error: "admin_settings 테이블이 없습니다." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export function appendSettingChangeLogs(
  bundle: AppSettingsBundleV1,
  logs: SettingChangeLog[]
): AppSettingsBundleV1 {
  return {
    ...bundle,
    changeLogs: [...logs, ...bundle.changeLogs].slice(0, MAX_LOGS),
  };
}

export function buildSettingChangeLogs(
  before: AppSettings,
  after: Partial<AppSettings>,
  adminId: string,
  adminNickname: string
): SettingChangeLog[] {
  const now = new Date().toISOString();
  const logs: SettingChangeLog[] = [];
  for (const key of Object.keys(after) as (keyof AppSettings)[]) {
    if (key === "updatedAt") continue;
    const oldVal = String(before[key] ?? "");
    const newVal = String(after[key] ?? "");
    if (oldVal === newVal) continue;
    logs.push({
      id: `scl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      key: String(key),
      oldValue: oldVal,
      newValue: newVal,
      adminId,
      adminNickname,
      createdAt: now,
    });
  }
  return logs;
}
