/**
 * 17단계: 운영설정 mock (Supabase 연동 시 교체)
 * - localStorage에 저장해 새로고침·다른 탭에서도 통화 등 설정이 유지되도록 함
 */

import type { AppSettings } from "@/lib/types/admin-settings";
import { DEFAULT_APP_SETTINGS } from "./admin-settings-utils";
import { addSettingChangeLog } from "./mock-setting-change-logs";

const STORAGE_KEY = "kasama_app_settings";

function loadFromStorage(): Partial<AppSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (parsed.defaultCurrency && typeof parsed.defaultCurrency === "string") {
      parsed.defaultCurrency = parsed.defaultCurrency.toUpperCase();
    }
    return parsed;
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

let current: AppSettings = (() => {
  const base = { ...DEFAULT_APP_SETTINGS };
  const stored = loadFromStorage();
  return { ...base, ...stored, updatedAt: base.updatedAt };
})();

export function getAppSettings(): AppSettings {
  const stored = loadFromStorage();
  if (Object.keys(stored).length > 0) {
    current = { ...DEFAULT_APP_SETTINGS, ...stored };
    if (current.defaultCurrency)
      current.defaultCurrency = current.defaultCurrency.toUpperCase();
  }
  return { ...current };
}

export function setAppSettings(settings: Partial<AppSettings>): AppSettings {
  current = { ...current, ...settings, updatedAt: new Date().toISOString() };
  saveToStorage(current);
  return current;
}

/** 단일 키 저장 + 변경 이력 기록 */
export function updateSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): void {
  const oldVal = String(current[key] ?? "");
  const newVal = String(value);
  if (oldVal === newVal) return;
  current = { ...current, [key]: value, updatedAt: new Date().toISOString() };
  saveToStorage(current);
  addSettingChangeLog(key, oldVal, newVal);
}

/** 여러 키 한 번에 저장 + 변경 이력 */
export function updateSettings(partial: Partial<AppSettings>): void {
  const normalized = { ...partial };
  if (typeof normalized.defaultCurrency === "string") {
    normalized.defaultCurrency = normalized.defaultCurrency.toUpperCase();
  }
  const keys = Object.keys(normalized) as (keyof AppSettings)[];
  for (const key of keys) {
    if (key === "updatedAt") continue;
    const value = normalized[key];
    if (value === undefined) continue;
    const oldVal = String(current[key] ?? "");
    const newVal = String(value);
    if (oldVal !== newVal) addSettingChangeLog(key, oldVal, newVal);
  }
  current = { ...current, ...normalized, updatedAt: new Date().toISOString() };
  saveToStorage(current);
}

/** 섹션 단위 기본값 복원 */
export function resetSettingsSection(
  keys: (keyof AppSettings)[]
): AppSettings {
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
