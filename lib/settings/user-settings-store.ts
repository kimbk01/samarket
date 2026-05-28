/**
 * user_settings 조회/저장
 * 운영 원본은 DB(API)이며, 브라우저 저장소는 초기 표시용 캐시로만 사용한다.
 */
import type { UserSettingsRow } from "@/lib/types/settings-db";
import { DEFAULT_USER_SETTINGS } from "@/lib/types/settings-db";
import {
  normalizeLanguagePreferenceForStorage,
  type AppLanguageCode,
} from "@/lib/i18n/config";
import { mergeUserSettingsPreferredLanguage } from "@/lib/settings/reconcile-user-settings-language";

const STORAGE_KEY = "kasama_user_settings";
export const USER_SETTINGS_CHANGED_EVENT = "samarket:user-settings-changed";
const cache = new Map<string, Partial<UserSettingsRow>>();
const inflight = new Map<string, Promise<Partial<UserSettingsRow>>>();
/** GET sync 시 서버 null + 로컬 explicit 업로드 — 동시·반복 PATCH 방지 */
const languageUploadInflight = new Map<string, Promise<void>>();
const languageUploadCooldownUntil = new Map<string, number>();
const LANGUAGE_UPLOAD_COOLDOWN_MS = 30_000;

function getStored(userId: string): Partial<UserSettingsRow> {
  if (typeof window === "undefined") return { ...DEFAULT_USER_SETTINGS };
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

function setStored(userId: string, partial: Partial<UserSettingsRow>): void {
  if (typeof window === "undefined") return;
  const next = { ...getStored(userId), ...partial };
  localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(next));
}

function normalizeSettings(userId: string, partial?: Partial<UserSettingsRow> | null): Partial<UserSettingsRow> {
  const prior = cache.get(userId) ?? getStored(userId);
  const next: Partial<UserSettingsRow> = {
    ...DEFAULT_USER_SETTINGS,
    ...prior,
    ...partial,
    user_id: userId,
  };
  if (partial && "preferred_language" in partial) {
    next.preferred_language = normalizeLanguagePreferenceForStorage(partial.preferred_language);
  }
  return next;
}

function emitChange(userId: string, settings: Partial<UserSettingsRow>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(USER_SETTINGS_CHANGED_EVENT, {
      detail: {
        userId,
        settings,
      },
    })
  );
}

function applySettings(userId: string, partial?: Partial<UserSettingsRow> | null): Partial<UserSettingsRow> {
  const next = normalizeSettings(userId, partial);
  cache.set(userId, next);
  setStored(userId, next);
  emitChange(userId, next);
  return next;
}

function schedulePreferredLanguageUpload(userId: string, language: AppLanguageCode): void {
  const cooldownUntil = languageUploadCooldownUntil.get(userId) ?? 0;
  if (Date.now() < cooldownUntil) return;

  const inflightKey = `${userId}:${language}`;
  if (languageUploadInflight.has(inflightKey)) return;

  const task = fetch("/api/me/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preferred_language: language }),
  })
    .then(async (res) => {
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Partial<UserSettingsRow> };
      if (res.ok && json?.ok) {
        languageUploadCooldownUntil.set(userId, Date.now() + LANGUAGE_UPLOAD_COOLDOWN_MS);
        applyMergedRemoteSettings(userId, json.settings ?? { preferred_language: language }, {
          allowUpload: false,
        });
        return;
      }
      if (!res.ok) {
        languageUploadCooldownUntil.set(userId, Date.now() + LANGUAGE_UPLOAD_COOLDOWN_MS);
      }
    })
    .catch(() => {
      languageUploadCooldownUntil.set(userId, Date.now() + LANGUAGE_UPLOAD_COOLDOWN_MS);
    })
    .finally(() => {
      languageUploadInflight.delete(inflightKey);
    });

  languageUploadInflight.set(inflightKey, task);
}

function applyMergedRemoteSettings(
  userId: string,
  remote: Partial<UserSettingsRow>,
  options?: { allowUpload?: boolean }
): Partial<UserSettingsRow> {
  const local = cache.get(userId) ?? getStored(userId);
  const { settings, shouldUploadToServer } = mergeUserSettingsPreferredLanguage(userId, remote, local);
  const applied = applySettings(userId, settings);
  if (options?.allowUpload !== false && shouldUploadToServer) {
    schedulePreferredLanguageUpload(userId, shouldUploadToServer);
  }
  return applied;
}

/** `getUserSettings` sync 트리거 없이 설정 캐시만 읽기 (언어 병합·Provider용) */
export function peekUserSettingsSnapshot(userId: string): Partial<UserSettingsRow> {
  return cache.get(userId) ?? getStored(userId);
}

async function fetchRemoteSettings(userId: string): Promise<Partial<UserSettingsRow>> {
  if (typeof window === "undefined") return getStored(userId);
  const res = await fetch("/api/me/settings", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`settings_fetch_failed:${res.status}`);
  }
  const json = (await res.json()) as { ok?: boolean; settings?: Partial<UserSettingsRow> };
  if (!json?.ok) {
    throw new Error("settings_fetch_failed");
  }
  return applyMergedRemoteSettings(userId, json.settings ?? {});
}

/** 현재 사용자 설정 조회 (동기 스냅샷 + 백그라운드 동기화 시작) */
export function getUserSettings(userId: string): Partial<UserSettingsRow> {
  const cached = cache.get(userId);
  if (cached) return cached;
  const stored = normalizeSettings(userId, getStored(userId));
  cache.set(userId, stored);
  if (typeof window !== "undefined") {
    void syncUserSettings(userId);
  }
  return stored;
}

export async function syncUserSettings(
  userId: string,
  options?: { force?: boolean }
): Promise<Partial<UserSettingsRow>> {
  if (!options?.force) {
    const pending = inflight.get(userId);
    if (pending) return pending;
  }
  const pending = fetchRemoteSettings(userId)
    .catch(() => normalizeSettings(userId, cache.get(userId) ?? getStored(userId)))
    .finally(() => {
      inflight.delete(userId);
    });
  inflight.set(userId, pending);
  return pending;
}

/** 설정 일부 업데이트 (UI는 즉시 갱신하고 서버로 동기화) */
export function updateUserSettings(userId: string, partial: Partial<UserSettingsRow>): void {
  applySettings(userId, {
    ...(cache.get(userId) ?? getStored(userId)),
    ...partial,
  });
  void fetch("/api/me/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  })
    .then(async (res) => {
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Partial<UserSettingsRow> };
      if (res.ok && json?.ok) {
        applyMergedRemoteSettings(userId, json.settings ?? partial, { allowUpload: false });
      }
    })
    .catch(() => {
      /* optimistic cache 유지 */
    });
}

export function subscribeUserSettings(
  listener: (payload: { userId: string; settings: Partial<UserSettingsRow> }) => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ userId: string; settings: Partial<UserSettingsRow> }>).detail;
    if (!detail?.userId) return;
    listener(detail);
  };
  window.addEventListener(USER_SETTINGS_CHANGED_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, handler as EventListener);
  };
}

export const LANGUAGE_NAMES: Record<string, string> = {
  ko: "한국어",
  en: "English",
};

export const COUNTRY_NAMES: Record<string, string> = {
  PH: "필리핀",
  KR: "한국",
  US: "미국",
};

export const VIDEO_AUTOPLAY_LABELS: Record<string, string> = {
  always: "항상",
  wifi_only: "Wi-Fi에서만",
  never: "끔",
};
