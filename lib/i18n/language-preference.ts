/**
 * 언어 저장소 읽기·쓰기 — `AppLanguageProvider`·`app/layout` SSR·스토어 prewarm 전용.
 * 결정 규칙은 `lib/i18n/app-language-authority.ts` 하나만 쓴다 (`docs/i18n-ssot.md` §2).
 * product UI 컴포넌트는 `useI18n()` / `runtime-app-language` 만 사용한다.
 *
 * 저장소:
 * - localStorage `samarket_app_language` — **이 기기에서 토글로 고른 값**(비로그인 기준값). 로그아웃 후에도 유지.
 * - localStorage `samarket_app_language_pending:{userId}` — 로그인 계정에서 토글했지만 서버 저장이 확인되지 않은 값.
 * - 쿠키 `samarket_signup_locale` — **지금 화면 언어(명시일 때만)**. SSR 첫 화면·가입 콜백용. 기기 언어를 따르면 쿠키 없음.
 * - 기기 언어 자동 감지값은 저장하지 않는다. 레거시 `samarket_lang_device_seeded` 는 읽지도 쓰지도 않는다.
 */
import {
  APP_LANGUAGE_COOKIE,
  APP_LANGUAGE_STORAGE_KEY,
  FALLBACK_APP_LANGUAGE,
  MAX_APP_LANGUAGE_INPUT_LENGTH,
  parseExplicitAppLanguage,
  resolveLanguageFromCandidates,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";
import { resolveServerAppLanguage } from "@/lib/i18n/app-language-authority";

export type { StoredPreferredLanguage };

const PENDING_KEY_PREFIX = "samarket_app_language_pending:";
const COOKIE_MAX_AGE_SEC = 31_536_000;

function safeLocalStorageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode · quota */
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

/** 기기 언어 후보 (`navigator.languages`) — 저장하지 않고 매번 읽는다 */
export function readDeviceLanguageCandidates(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** 이 기기에서 토글로 고른 값 */
export function readDeviceLanguageChoice(): AppLanguageCode | null {
  return parseExplicitAppLanguage(safeLocalStorageGet(APP_LANGUAGE_STORAGE_KEY));
}

export function writeDeviceLanguageChoice(language: AppLanguageCode): void {
  const explicit = parseExplicitAppLanguage(language);
  if (explicit) safeLocalStorageSet(APP_LANGUAGE_STORAGE_KEY, explicit);
}

/** @deprecated `readDeviceLanguageChoice` — 스토어 prewarm 호환 */
export function readExplicitLocalLanguage(): AppLanguageCode | null {
  return readDeviceLanguageChoice();
}

export function readPendingAccountLanguage(userId: string): AppLanguageCode | null {
  const uid = userId.trim();
  if (!uid) return null;
  return parseExplicitAppLanguage(safeLocalStorageGet(`${PENDING_KEY_PREFIX}${uid}`));
}

export function writePendingAccountLanguage(userId: string, language: AppLanguageCode): void {
  const uid = userId.trim();
  const explicit = parseExplicitAppLanguage(language);
  if (uid && explicit) safeLocalStorageSet(`${PENDING_KEY_PREFIX}${uid}`, explicit);
}

export function clearPendingAccountLanguage(userId: string): void {
  const uid = userId.trim();
  if (uid) safeLocalStorageRemove(`${PENDING_KEY_PREFIX}${uid}`);
}

/** 화면 언어 쿠키 (명시일 때만) */
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
    return parseExplicitAppLanguage(decodeURIComponent(encoded));
  } catch {
    return null;
  }
}

/** 화면 언어 쿠키 쓰기 — null 이면 삭제(서버는 Accept-Language = 기기 언어 사용) */
export function writeDisplayLanguageCookie(language: AppLanguageCode | null): void {
  if (typeof document === "undefined") return;
  try {
    const explicit = language ? parseExplicitAppLanguage(language) : null;
    if (explicit) {
      if (readExplicitLanguageCookie() === explicit) return;
      document.cookie = `${APP_LANGUAGE_COOKIE}=${encodeURIComponent(explicit)}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
    } else if (readExplicitLanguageCookie() !== null) {
      document.cookie = `${APP_LANGUAGE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Provider 적용 전(첫 페인트·prewarm) 화면 언어 추정 — 화면 언어 쿠키 → 이 기기의 선택. 둘 다 없으면 null(기기 언어 따름).
 * 로그인 계정 언어는 Provider 가 쿠키에 반영하므로 쿠키가 먼저다.
 */
export function peekExplicitDisplayLanguage(): AppLanguageCode | null {
  return readExplicitLanguageCookie() ?? readDeviceLanguageChoice();
}

/** 기기/브라우저 언어 (ko 포함 → ko, 그 외 → en) */
export function getDeviceAppLanguage(): AppLanguageCode {
  return resolveLanguageFromCandidates(readDeviceLanguageCandidates());
}

export function detectAcceptLanguageAppLanguage(acceptLanguage: string | null | undefined): AppLanguageCode {
  if (!acceptLanguage?.trim()) return FALLBACK_APP_LANGUAGE;
  return resolveServerAppLanguage({ acceptLanguage });
}

/** 스토어 browse/home-feed/ETA API — 서버 `uiLang` 과 맞추는 Accept-Language */
export function storesApiAcceptLanguageHeader(language: AppLanguageCode): Record<string, string> {
  return {
    "Accept-Language": language === "ko" ? "ko-KR,ko;q=0.9,en;q=0.3" : "en-US,en;q=0.9,ko;q=0.3",
  };
}

/** SSR 첫 화면 — 화면 언어 쿠키 → Accept-Language → en */
export function resolveServerInitialLanguage(options: {
  cookieValue?: string | null;
  acceptLanguage?: string | null;
}): AppLanguageCode {
  return resolveServerAppLanguage({ cookie: options.cookieValue, acceptLanguage: options.acceptLanguage });
}
