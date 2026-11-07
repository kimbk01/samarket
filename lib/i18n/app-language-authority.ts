/**
 * 앱 UI 언어 결정 — 단일 정의 (`docs/i18n-ssot.md` §2). 순수 함수만 둔다(저장소 읽기·쓰기는 `language-preference.ts`).
 *
 * 클라이언트 (매 렌더·동기화마다 같은 함수로 계산):
 * - 로그인: 이 계정의 미전송 선택(pending) → 계정 설정(DB `user_settings.preferred_language`) → 이 기기의 선택 → 기기 언어
 * - 비로그인: 이 기기의 선택 → 기기 언어
 * - 기기 언어는 저장하지 않는다(매번 계산). 「명시 선택」은 언어 토글만 만든다.
 *
 * 서버: 계정 설정 → 쿠키(화면 언어) → Accept-Language → en.
 */
import {
  FALLBACK_APP_LANGUAGE,
  parseExplicitAppLanguage,
  resolveLanguageFromCandidates,
  type AppLanguageCode,
} from "@/lib/i18n/config";

export type AppLanguageSource = "pending" | "account" | "device-choice" | "device-language";

export type AppLanguageResolution = {
  /** 화면에 쓰는 언어 */
  resolved: AppLanguageCode;
  /** 지금 문맥(로그인=계정, 비로그인=기기)에서 사용자가 고른 값. 없으면 null(= 기기 언어 따름) */
  preference: AppLanguageCode | null;
  source: AppLanguageSource;
};

export function resolveClientAppLanguage(input: {
  isLoggedIn: boolean;
  /** 이 계정에서 토글했지만 서버 저장이 확인되지 않은 값 */
  pending?: unknown;
  /** 계정 설정 — 서버 값 또는 그 캐시 */
  account?: unknown;
  /** 이 기기에서 토글한 값 (`samarket_app_language`) */
  deviceChoice?: unknown;
  /** `navigator.languages` 등 기기 언어 후보 */
  deviceLanguages: readonly string[];
}): AppLanguageResolution {
  const deviceChoice = parseExplicitAppLanguage(input.deviceChoice);
  if (input.isLoggedIn) {
    const pending = parseExplicitAppLanguage(input.pending);
    if (pending) return { resolved: pending, preference: pending, source: "pending" };
    const account = parseExplicitAppLanguage(input.account);
    if (account) return { resolved: account, preference: account, source: "account" };
    /** 계정 설정이 없으면 이 기기의 선택으로 보여 주기만 한다 — 계정에 저장하지 않는다 */
    if (deviceChoice) return { resolved: deviceChoice, preference: null, source: "device-choice" };
  } else if (deviceChoice) {
    return { resolved: deviceChoice, preference: deviceChoice, source: "device-choice" };
  }
  return {
    resolved: resolveLanguageFromCandidates(input.deviceLanguages),
    preference: null,
    source: "device-language",
  };
}

/**
 * 화면 언어 쿠키 값 — SSR 첫 화면용. 기기 언어를 따를 때는 쿠키를 두지 않는다(서버는 Accept-Language = 기기 언어).
 */
export function displayLanguageCookieValue(r: AppLanguageResolution): AppLanguageCode | null {
  return r.source === "device-language" ? null : r.resolved;
}

/**
 * 계정 설정 동기화 후 할 일 — 기기 값이 계정 값을 덮지 않는다. 미전송 선택만 올린다.
 */
export function decideAccountLanguageSync(input: {
  pending?: unknown;
  remote?: unknown;
}): { upload: AppLanguageCode | null; clearPending: boolean } {
  const pending = parseExplicitAppLanguage(input.pending);
  if (!pending) return { upload: null, clearPending: false };
  const remote = parseExplicitAppLanguage(input.remote);
  if (remote === pending) return { upload: null, clearPending: true };
  return { upload: pending, clearPending: false };
}

/** 서버(SSR·API·알림 외 요청 경로) 언어 — 서버 기본값 ko 를 쓰지 않는다 */
export function resolveServerAppLanguage(input: {
  account?: unknown;
  cookie?: unknown;
  acceptLanguage?: string | null;
}): AppLanguageCode {
  const account = parseExplicitAppLanguage(input.account);
  if (account) return account;
  const cookie = parseExplicitAppLanguage(input.cookie);
  if (cookie) return cookie;
  const header = input.acceptLanguage?.trim();
  if (header) {
    const candidates = header
      .split(",")
      .map((part) => part.split(";")[0]?.trim() ?? "")
      .filter(Boolean);
    return resolveLanguageFromCandidates(candidates);
  }
  return FALLBACK_APP_LANGUAGE;
}
