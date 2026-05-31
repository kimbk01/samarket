/**
 * cookie/local/browser 읽기·쓰기 — `AppLanguageProvider`·`app/layout` SSR·auth callback 전용.
 * product UI 컴포넌트는 `useI18n()` / `runtime-app-language` 만 사용한다.
 *
 * DIBAY 우선순위 (클라이언트):
 * - 로그인: localStorage(`samarket_app_language`) → cookie → user_settings 캐시 → device 1회 seed → en
 * - 비로그인: localStorage → cookie → device 1회 seed → en
 * - 내정보에서 명시 변경 직후 PATCH·원격 sync 전에도 localStorage가 stale server/kasama 캐시를 덮지 않게 한다.
 * - 로그아웃 시 `clearLanguagePersistence` 호출 금지 (세션만 종료)
 */
import {
  APP_LANGUAGE_COOKIE,
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  FALLBACK_APP_LANGUAGE,
  MAX_APP_LANGUAGE_INPUT_LENGTH,
  getBrowserLanguage,
  isSystemLanguagePreference,
  parseExplicitAppLanguage,
  preferredLanguageFromDbColumn,
  resolveLanguageFromCandidates,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";

export type { StoredPreferredLanguage };

/** Provider·내정보 토글 — preference(null=기기) + 실제 UI 언어 */
export type ClientLanguagePresentation = {
  preference: StoredPreferredLanguage;
  resolved: AppLanguageCode;
};

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorageRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* private mode · quota */
  }
}

/** @deprecated `getStoredLanguagePreference` */
export function parseLanguagePreference(input: unknown): StoredPreferredLanguage {
  return getStoredLanguagePreference(input);
}

/** DB/API 값 → ko/en 명시 선택 또는 null(기기 언어) */
export function getStoredLanguagePreference(input: unknown): StoredPreferredLanguage {
  return preferredLanguageFromDbColumn(input);
}

export function readExplicitLanguageCookie(): AppLanguageCode | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${APP_LANGUAGE_COOKIE}=`));
  if (!raw) return null;
  const encoded = raw.slice(APP_LANGUAGE_COOKIE.length + 1);
  if (!encoded || encoded.length > MAX_APP_LANGUAGE_INPUT_LENGTH * 4) return null;
  try {
    const value = decodeURIComponent(encoded);
    return parseExplicitAppLanguage(value);
  } catch {
    return null;
  }
}

export function readExplicitLocalLanguage(): AppLanguageCode | null {
  return parseExplicitAppLanguage(safeLocalStorageGet(APP_LANGUAGE_STORAGE_KEY));
}

/** 비로그인 explicit: localStorage → cookie */
export function readGuestExplicitAppLanguage(): AppLanguageCode | null {
  return readExplicitLocalLanguage() ?? readExplicitLanguageCookie() ?? null;
}

/** 로그인 explicit: localStorage → cookie → user_settings(DB/캐시) */
export function readLoggedInExplicitAppLanguage(cachedPreferredLanguage?: unknown): AppLanguageCode | null {
  return (
    readExplicitLocalLanguage() ??
    readExplicitLanguageCookie() ??
    parseExplicitAppLanguage(cachedPreferredLanguage) ??
    null
  );
}

/**
 * 명시 ko/en 저장이 없을 때만 사용.
 * navigator는 최초 1회 seed 후 `FALLBACK_APP_LANGUAGE`(en)만 반환한다.
 * seed 시 감지한 언어는 persist 해 이후 기기 언어가 선택을 덮어쓰지 않게 한다.
 */
export function resolveImplicitAppLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return FALLBACK_APP_LANGUAGE;
  try {
    if (safeLocalStorageGet(APP_LANGUAGE_DEVICE_SEEDED_KEY) === "1") {
      return FALLBACK_APP_LANGUAGE;
    }
    const detected = getBrowserLanguage();
    safeLocalStorageSet(APP_LANGUAGE_DEVICE_SEEDED_KEY, "1");
    persistExplicitLanguage(detected);
    return detected;
  } catch {
    return FALLBACK_APP_LANGUAGE;
  }
}

/**
 * 클라이언트 UI 언어 + preference(내정보 토글) — 단일 진입.
 * 명시 ko/en → preference·resolved 동일. 없으면 preference null + 기기/seed.
 */
export function resolveClientLanguagePresentation(options: {
  isLoggedIn: boolean;
  cachedPreferredLanguage?: unknown;
}): ClientLanguagePresentation {
  const explicit = options.isLoggedIn
    ? readLoggedInExplicitAppLanguage(options.cachedPreferredLanguage)
    : readGuestExplicitAppLanguage();
  if (explicit) {
    return { preference: explicit, resolved: explicit };
  }
  return { preference: null, resolved: resolveImplicitAppLanguage() };
}

/** @deprecated `resolveClientLanguagePresentation().resolved` */
export function resolveClientAppLanguageCode(options: {
  isLoggedIn: boolean;
  cachedPreferredLanguage?: unknown;
}): AppLanguageCode {
  return resolveClientLanguagePresentation(options).resolved;
}

export function clearLanguagePersistence(): void {
  if (typeof window === "undefined") return;
  safeLocalStorageRemove(APP_LANGUAGE_STORAGE_KEY);
  try {
    document.cookie = `${APP_LANGUAGE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function persistExplicitLanguage(language: AppLanguageCode): void {
  if (typeof window === "undefined") return;
  const resolved = parseExplicitAppLanguage(language) ?? FALLBACK_APP_LANGUAGE;
  safeLocalStorageSet(APP_LANGUAGE_STORAGE_KEY, resolved);
  try {
    document.cookie = `${APP_LANGUAGE_COOKIE}=${encodeURIComponent(resolved)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

/**
 * 앱 UI 언어 결정 — explicit 사용자 선택(ko/en)만 저장소·설정에서 읽고,
 * system이면 브라우저(또는 SSR Accept-Language) 우선.
 */
export function resolveAppLanguageCode(options: {
  preferredLanguage?: unknown;
  localStorageValue?: string | null;
  cookieValue?: string | null;
  acceptLanguage?: string | null;
  browserDetect?: () => AppLanguageCode;
}): AppLanguageCode {
  const browser = options.browserDetect ?? getBrowserLanguage;

  const fromPreference = parseExplicitAppLanguage(options.preferredLanguage);
  if (fromPreference) return fromPreference;

  const skipStored =
    options.preferredLanguage !== undefined &&
    isSystemLanguagePreference(options.preferredLanguage);

  if (!skipStored) {
    const fromLocal = parseExplicitAppLanguage(options.localStorageValue);
    if (fromLocal) return fromLocal;
    const fromCookie = parseExplicitAppLanguage(options.cookieValue);
    if (fromCookie) return fromCookie;
  }

  if (options.acceptLanguage) {
    return detectAcceptLanguageAppLanguage(options.acceptLanguage);
  }

  return browser();
}

export function detectAcceptLanguageAppLanguage(acceptLanguage: string | null | undefined): AppLanguageCode {
  if (!acceptLanguage?.trim()) return FALLBACK_APP_LANGUAGE;
  const candidates = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
  return resolveLanguageFromCandidates(candidates);
}

/** 스토어 browse/home-feed API — 서버 `uiLang`과 맞추는 Accept-Language */
export function storesApiAcceptLanguageHeader(language: AppLanguageCode): HeadersInit {
  return {
    "Accept-Language": language === "ko" ? "ko-KR,ko;q=0.9,en;q=0.3" : "en-US,en;q=0.9,ko;q=0.3",
  };
}

export function resolveServerInitialLanguage(options: {
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}): AppLanguageCode {
  return resolveAppLanguageCode({
    preferredLanguage: undefined,
    cookieValue: options.cookieValue,
    acceptLanguage: options.acceptLanguage,
    browserDetect: () => FALLBACK_APP_LANGUAGE,
  });
}

/** 비로그인: 쿠키·localStorage의 명시 ko/en만 (DB·system 없음) */
export function resolveGuestAppLanguageCode(options: {
  localStorageValue?: string | null;
  cookieValue?: string | null;
  acceptLanguage?: string | null;
  browserDetect?: () => AppLanguageCode;
}): AppLanguageCode {
  const fromLocal = parseExplicitAppLanguage(options.localStorageValue);
  if (fromLocal) return fromLocal;
  const fromCookie = parseExplicitAppLanguage(options.cookieValue);
  if (fromCookie) return fromCookie;
  if (options.acceptLanguage) {
    return detectAcceptLanguageAppLanguage(options.acceptLanguage);
  }
  return (options.browserDetect ?? getBrowserLanguage)();
}

/**
 * @deprecated `readGuestExplicitAppLanguage` 또는 `readLoggedInExplicitAppLanguage` 사용.
 */
export function readClientExplicitAppLanguage(options?: {
  cachedPreferredLanguage?: unknown;
}): AppLanguageCode | null {
  if (options && "cachedPreferredLanguage" in options) {
    return readLoggedInExplicitAppLanguage(options.cachedPreferredLanguage);
  }
  return readGuestExplicitAppLanguage();
}

/** 로그인: DB/설정 explicit ko/en → 없으면 기기·브라우저 (쿠키는 system일 때만 보조) */
export function resolveAuthenticatedAppLanguageCode(options: {
  preferredLanguage?: unknown;
  localStorageValue?: string | null;
  cookieValue?: string | null;
  browserDetect?: () => AppLanguageCode;
}): AppLanguageCode {
  return resolveAppLanguageCode({
    preferredLanguage: options.preferredLanguage,
    localStorageValue: options.localStorageValue,
    cookieValue: options.cookieValue,
    browserDetect: options.browserDetect ?? getBrowserLanguage,
  });
}
