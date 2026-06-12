/**
 * 앱 운영설정 — 클라이언트 메모리 + localStorage 캐시.
 * 영속화는 `app-settings-db` + `/api/admin/app-settings` · 공개 `/api/app-settings`.
 */
import type { AppSettings, SettingChangeLog } from "@/lib/types/admin-settings";
import { isLegacyAppDisplayName, resolveAppDisplayName } from "@/lib/brand/app-display-name";
import { DEFAULT_APP_SETTINGS } from "@/lib/admin-settings/admin-settings-utils";

const STORAGE_KEY = "samarket_app_settings_v1";

let current: AppSettings = { ...DEFAULT_APP_SETTINGS };
let changeLogs: SettingChangeLog[] = [];
let hydratedFromServer = false;

function normalizeStoredSettings(parsed: Partial<AppSettings>): Partial<AppSettings> {
  if (parsed.defaultCurrency && typeof parsed.defaultCurrency === "string") {
    parsed.defaultCurrency = parsed.defaultCurrency.toUpperCase();
  }
  if (isLegacyAppDisplayName(parsed.siteName)) {
    parsed.siteName = resolveAppDisplayName(parsed.siteName);
  }
  return parsed;
}

function normalizeSettingsInput(settings: Partial<AppSettings>): Partial<AppSettings> {
  return normalizeStoredSettings({ ...settings });
}

function loadFromStorage(): Partial<AppSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const rawParsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeStoredSettings({ ...rawParsed });
  } catch {
    return {};
  }
}

function saveToStorage(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function applySettings(settings: AppSettings): void {
  current = { ...settings };
  saveToStorage(current);
}

if (typeof window !== "undefined") {
  const stored = loadFromStorage();
  if (Object.keys(stored).length > 0) {
    current = { ...DEFAULT_APP_SETTINGS, ...stored };
  }
}

export function getAppSettings(): AppSettings {
  if (typeof window !== "undefined") {
    const stored = loadFromStorage();
    if (Object.keys(stored).length > 0) {
      current = { ...DEFAULT_APP_SETTINGS, ...stored };
    }
  }
  return { ...current };
}

export function importAppSettingsBundle(settings: AppSettings, logs?: SettingChangeLog[]): void {
  applySettings({ ...DEFAULT_APP_SETTINGS, ...settings });
  if (logs) changeLogs = [...logs];
  hydratedFromServer = true;
}

export function setAppSettings(settings: Partial<AppSettings>): AppSettings {
  current = { ...current, ...normalizeSettingsInput(settings), updatedAt: new Date().toISOString() };
  saveToStorage(current);
  return current;
}

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  const nextValue =
    key === "siteName"
      ? (resolveAppDisplayName(String(value ?? "")) as AppSettings[K])
      : value;
  const oldVal = String(current[key] ?? "");
  const newVal = String(nextValue);
  if (oldVal === newVal) return;
  current = { ...current, [key]: nextValue, updatedAt: new Date().toISOString() };
  saveToStorage(current);
}

export function updateSettings(partial: Partial<AppSettings>): void {
  const normalized = normalizeSettingsInput(partial);
  if (typeof normalized.defaultCurrency === "string") {
    normalized.defaultCurrency = normalized.defaultCurrency.toUpperCase();
  }
  current = { ...current, ...normalized, updatedAt: new Date().toISOString() };
  saveToStorage(current);
}

export function resetSettingsSection(keys: (keyof AppSettings)[]): AppSettings {
  const partial: Partial<AppSettings> = {};
  for (const key of keys) {
    const defaultVal = DEFAULT_APP_SETTINGS[key];
    if (defaultVal !== undefined) {
      (partial as Record<string, string | number | boolean | undefined>)[key as string] = defaultVal;
    }
  }
  updateSettings(partial);
  return getAppSettings();
}

const PAGE_SIZE_DEFAULT = 30;

export interface GetSettingChangeLogsOptions {
  page?: number;
  pageSize?: number;
}

export interface GetSettingChangeLogsResult {
  logs: SettingChangeLog[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export function getSettingChangeLogs(
  options: number | GetSettingChangeLogsOptions = PAGE_SIZE_DEFAULT
): GetSettingChangeLogsResult | SettingChangeLog[] {
  const opts: GetSettingChangeLogsOptions =
    typeof options === "number" ? { page: 1, pageSize: options } : options;
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(1, opts.pageSize ?? PAGE_SIZE_DEFAULT);

  const sorted = [...changeLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize;
  const logs = sorted.slice(from, from + pageSize);

  return { logs, total, totalPages, page, pageSize };
}

/** 공개 API에서 최신 설정 동기화 (앱 부트스트랩) */
export async function hydrateAppSettingsFromPublicApi(): Promise<{ ok: boolean }> {
  if (typeof window === "undefined") return { ok: false };
  try {
    const res = await fetch("/api/app-settings", { cache: "no-store" });
    const j = (await res.json()) as { ok?: boolean; settings?: AppSettings };
    if (!res.ok || !j.ok || !j.settings) return { ok: false };
    applySettings({ ...DEFAULT_APP_SETTINGS, ...j.settings });
    hydratedFromServer = true;
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 관리자 설정 페이지 — 서버 번들 로드 */
export async function loadAppSettingsFromServer(): Promise<{
  ok: boolean;
  source?: "db" | "default";
  error?: string;
}> {
  try {
    const res = await fetch("/api/admin/app-settings", { cache: "no-store" });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: { settings: AppSettings; changeLogs?: SettingChangeLog[] };
      source?: "db" | "default";
      error?: string;
    };
    if (!res.ok || !j.ok || !j.bundle?.settings) {
      return { ok: false, error: j.error ?? "load_failed" };
    }
    importAppSettingsBundle(j.bundle.settings, j.bundle.changeLogs);
    return { ok: true, source: j.source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

/** 관리자 — 설정 저장 + 변경 이력 서버 반영 */
export async function persistAppSettingsToServer(
  partial: Partial<AppSettings>
): Promise<{ ok: boolean; error?: string }> {
  updateSettings(partial);
  try {
    const res = await fetch("/api/admin/app-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: getAppSettings() }),
    });
    const j = (await res.json()) as {
      ok?: boolean;
      bundle?: { settings: AppSettings; changeLogs?: SettingChangeLog[] };
      error?: string;
    };
    if (!res.ok || !j.ok) {
      return { ok: false, error: j.error ?? "save_failed" };
    }
    if (j.bundle?.settings) {
      importAppSettingsBundle(j.bundle.settings, j.bundle.changeLogs);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network" };
  }
}

/** 관리자 — 섹션 기본값 복원 */
export async function resetAppSettingsSectionOnServer(
  keys: (keyof AppSettings)[]
): Promise<{ ok: boolean; error?: string }> {
  const partial: Partial<AppSettings> = {};
  for (const key of keys) {
    const defaultVal = DEFAULT_APP_SETTINGS[key];
    if (defaultVal !== undefined) {
      (partial as Record<string, string | number | boolean | undefined>)[key as string] = defaultVal;
    }
  }
  return persistAppSettingsToServer(partial);
}

export function isAppSettingsHydratedFromServer(): boolean {
  return hydratedFromServer;
}
