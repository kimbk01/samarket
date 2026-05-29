/**
 * cookie/local/browser 읽기·쓰기 — `AppLanguageProvider`·`app/layout` SSR·auth callback 전용.
 * product UI 컴포넌트는 `useI18n()` / `runtime-app-language` 만 사용한다.
 *
 * DIBAY 우선순위 (클라이언트):
 * - 로그인: user_settings → localStorage → cookie → device 1회 seed → en
 * - 비로그인: localStorage → cookie → device 1회 seed → en
 * - 로그아웃 시 `clearLanguagePersistence` 호출 금지 (세션만 종료)
 */
import {
  APP_LANGUAGE_COOKIE,
  APP_LANGUAGE_DEVICE_SEEDED_KEY,
  APP_LANGUAGE_STORAGE_KEY,
  FALLBACK_APP_LANGUAGE,
  getBrowserLanguage,
  isSystemLanguagePreference,
  parseExplicitAppLanguage,
  preferredLanguageFromDbColumn,
  resolveLanguageFromCandidates,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";

export type { StoredPreferredLanguage };

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
  const value = decodeURIComponent(raw.slice(APP_LANGUAGE_COOKIE.length + 1));
  return parseExplicitAppLanguage(value);
}

export function readExplicitLocalLanguage(): AppLanguageCode | null {
  if (typeof window === "undefined") return null;
  return parseExplicitAppLanguage(window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY));
}

/** 비로그인 explicit: localStorage → cookie */
export function readGuestExplicitAppLanguage(): AppLanguageCode | null {
  return readExplicitLocalLanguage() ?? readExplicitLanguageCookie() ?? null;
}

/** 로그인 explicit: user_settings(DB/캐시) → localStorage → cookie */
export function readLoggedInExplicitAppLanguage(cachedPreferredLanguage?: unknown): AppLanguageCode | null {
  const fromSettings = parseExplicitAppLanguage(cachedPreferredLanguage);
  if (fromSettings) return fromSettings;
  return readExplicitLocalLanguage() ?? readExplicitLanguageCookie() ?? null;
}

/**
 * 명시 ko/en 저장이 없을 때만 사용.
 * navigator는 최초 1회 seed 후 `FALLBACK_APP_LANGUAGE`(en)만 반환한다.
 * seed 시 감지한 언어는 persist 해 이후 기기 언어가 선택을 덮어쓰지 않게 한다.
 */
export function resolveImplicitAppLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return FALLBACK_APP_LANGUAGE;
  try {
    if (window.localStorage.getItem(APP_LANGUAGE_DEVICE_SEEDED_KEY) === "1") {
      return FALLBACK_APP_LANGUAGE;
    }
    const detected = getBrowserLanguage();
    window.localStorage.setItem(APP_LANGUAGE_DEVICE_SEEDED_KEY, "1");
    persistExplicitLanguage(detected);
    return detected;
  } catch {
    return FALLBACK_APP_LANGUAGE;
  }
}

/** 클라이언트 앱 UI 언어 — 로그인/비로그인 우선순위 단일 진입 */
export function resolveClientAppLanguageCode(options: {
  isLoggedIn: boolean;
  cachedPreferredLanguage?: unknown;
}): AppLanguageCode {
  const explicit = options.isLoggedIn
    ? readLoggedInExplicitAppLanguage(options.cachedPreferredLanguage)
    : readGuestExplicitAppLanguage();
  if (explicit) return explicit;
  return resolveImplicitAppLanguage();
}

export function clearLanguagePersistence(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(APP_LANGUAGE_STORAGE_KEY);
  document.cookie = `${APP_LANGUAGE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function persistExplicitLanguage(language: AppLanguageCode): void {
  if (typeof window === "undefined") return;
  const resolved = parseExplicitAppLanguage(language) ?? FALLBACK_APP_LANGUAGE;
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, resolved);
  document.cookie = `${APP_LANGUAGE_COOKIE}=${encodeURIComponent(resolved)}; path=/; max-age=31536000; SameSite=Lax`;
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
