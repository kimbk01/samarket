/**
 * user_settings 조회/저장
 * 운영 원본은 DB(API)이며, 브라우저 저장소는 초기 표시용 캐시로만 사용한다.
 */
import type { UserSettingsRow } from "@/lib/types/settings-db";
import { DEFAULT_USER_SETTINGS } from "@/lib/types/settings-db";
import { APP_LANGUAGE_CHANGED_EVENT, normalizeAppLanguage } from "@/lib/i18n/config";

const STORAGE_KEY = "kasama_user_settings";
export const USER_SETTINGS_CHANGED_EVENT = "samarket:user-settings-changed";
const cache = new Map<string, Partial<UserSettingsRow>>();
const inflight = new Map<string, Promise<Partial<UserSettingsRow>>>();

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
  const next = {
    ...DEFAULT_USER_SETTINGS,
    ...partial,
  };
  if (partial?.preferred_language) {
    next.preferred_language = normalizeAppLanguage(partial.preferred_language);
  }
  return {
    ...next,
    user_id: userId,
  };
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
  return applySettings(userId, json.settings);
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
  const next = applySettings(userId, {
    ...(cache.get(userId) ?? getStored(userId)),
    ...partial,
  });
  if (typeof window !== "undefined" && "preferred_language" in partial && partial.preferred_language) {
    window.dispatchEvent(
      new CustomEvent(APP_LANGUAGE_CHANGED_EVENT, {
        detail: normalizeAppLanguage(partial.preferred_language),
      })
    );
  }
  void fetch("/api/me/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  })
    .then(async (res) => {
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: Partial<UserSettingsRow> };
      if (res.ok && json?.ok) {
        applySettings(userId, json.settings ?? next);
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
  "zh-CN": "简体中文",
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
