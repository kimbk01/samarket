"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  peekRemoteConfirmedPreferredLanguage,
  peekUserSettingsSnapshot,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import {
  APP_LANGUAGE_CHANGED_EVENT,
  APP_LANGUAGE_STORAGE_KEY,
  FALLBACK_APP_LANGUAGE,
  parseExplicitAppLanguage,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";
import {
  decideAccountLanguageSync,
  displayLanguageCookieValue,
  resolveClientAppLanguage,
  type AppLanguageResolution,
} from "@/lib/i18n/app-language-authority";
import {
  clearPendingAccountLanguage,
  readDeviceLanguageCandidates,
  readDeviceLanguageChoice,
  readPendingAccountLanguage,
  writeDeviceLanguageChoice,
  writeDisplayLanguageCookie,
  writePendingAccountLanguage,
} from "@/lib/i18n/language-preference";
import { translateText, type MessageKey } from "@/lib/i18n/messages";
import { safeTranslate, type SafeTranslateOptions } from "@/lib/i18n/safe-translate";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

type AppLanguageContextValue = {
  language: AppLanguageCode;
  /** 지금 문맥(로그인=계정, 비로그인=기기)에서 사용자가 고른 값. null = 기기 언어 따름 */
  languagePreference: StoredPreferredLanguage;
  setLanguage: (language: AppLanguageCode) => void;
  /** UI 표시용 — key·빈값·미치환 placeholder 노출 방지 (전역 기본) */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** `fallbackKo` / `fallbackEn` 를 명시할 때 */
  safeT: (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

/**
 * 언어 결정 — `docs/i18n-ssot.md` §2 · `lib/i18n/app-language-authority.ts` 만 사용.
 * 기기 언어는 저장하지 않는다. 계정 언어는 서버 값이 기준이고, 기기 값으로 덮지 않는다.
 */
function computeResolution(): AppLanguageResolution {
  const userId = getCurrentUser()?.id ?? null;
  return resolveClientAppLanguage({
    isLoggedIn: Boolean(userId),
    pending: userId ? readPendingAccountLanguage(userId) : null,
    account: userId ? peekUserSettingsSnapshot(userId).preferred_language : null,
    deviceChoice: readDeviceLanguageChoice(),
    deviceLanguages: readDeviceLanguageCandidates(),
  });
}

/** React 밖 i18n(`getRuntimeAppLanguage`) 구독자 알림 — Provider 는 이 이벤트를 다시 받지 않는다 */
function emitLanguageChanged(language: AppLanguageCode): void {
  window.dispatchEvent(
    new CustomEvent<AppLanguageCode>(APP_LANGUAGE_CHANGED_EVENT, {
      detail: language,
    })
  );
}

/** 서버 저장 — 성공을 서버가 확인하면 미전송 표시를 지운다 */
function saveAccountLanguage(userId: string, language: AppLanguageCode): Promise<void> {
  return updateUserSettings(userId, { preferred_language: language }, { onFailure: "keepLocal" }).then((ok) => {
    if (ok && readPendingAccountLanguage(userId) === language) clearPendingAccountLanguage(userId);
  });
}

export function AppLanguageProvider({
  children,
  initialLanguage = FALLBACK_APP_LANGUAGE,
}: {
  children: ReactNode;
  /** 서버에서 읽은 쿠키·Accept-Language와 동일해야 하이드레이션이 깨지지 않음 */
  initialLanguage?: AppLanguageCode;
}) {
  const [language, setLanguageState] = useState<AppLanguageCode>(
    () => parseExplicitAppLanguage(initialLanguage) ?? FALLBACK_APP_LANGUAGE
  );

  /**
   * `translateCmUi` 등 React 밖 i18n은 `getRuntimeAppLanguage()`를 본다.
   * useEffect만 쓰면 SSR·하이드레이션 첫 페인트에서 모듈 기본값(en)과 context(ko)가 갈라진다.
   */
  setRuntimeAppLanguage(language);
  const [languagePreference, setLanguagePreferenceState] = useState<StoredPreferredLanguage>(null);
  const lastAppliedRef = useRef<AppLanguageResolution | null>(null);
  /** S8-1 — 마지막으로 네이티브에 보낸 화면 언어(undefined = 아직 안 보냄) */
  const nativeLanguageRef = useRef<AppLanguageCode | null | undefined>(undefined);

  const apply = useCallback((r: AppLanguageResolution) => {
    const display = displayLanguageCookieValue(r);
    writeDisplayLanguageCookie(display);
    /** S8-1 — 같은 값을 네이티브에도 저장(값이 바뀔 때만). 웹·구 앱은 모듈 안에서 생략 */
    if (nativeLanguageRef.current !== display) {
      nativeLanguageRef.current = display;
      void import("@/lib/i18n/native-app-language")
        .then((m) => m.setNativeAppLanguage(display))
        .catch(() => undefined);
    }
    const last = lastAppliedRef.current;
    if (last && last.resolved === r.resolved && last.preference === r.preference) return;
    const languageChanged = !last || last.resolved !== r.resolved;
    lastAppliedRef.current = r;
    setLanguagePreferenceState(r.preference);
    setLanguageState(r.resolved);
    setRuntimeAppLanguage(r.resolved);
    if (languageChanged) emitLanguageChanged(r.resolved);
  }, []);

  const refresh = useCallback(() => apply(computeResolution()), [apply]);

  /** 계정 설정을 서버에서 받아 반영 — 미전송 토글만 다시 올린다 */
  const syncAccount = useCallback(async () => {
    const userId = getCurrentUser()?.id;
    if (!userId) return;
    await syncUserSettings(userId).catch(() => null);
    if (getCurrentUser()?.id !== userId) return;
    const remote = peekRemoteConfirmedPreferredLanguage(userId);
    if (remote !== undefined) {
      const decision = decideAccountLanguageSync({ pending: readPendingAccountLanguage(userId), remote });
      if (decision.clearPending) clearPendingAccountLanguage(userId);
      if (decision.upload) void saveAccountLanguage(userId, decision.upload).then(refresh);
    }
    refresh();
  }, [refresh]);

  const setLanguage = useCallback(
    (next: AppLanguageCode) => {
      const explicit = parseExplicitAppLanguage(next);
      if (!explicit) return;
      writeDeviceLanguageChoice(explicit);
      const userId = getCurrentUser()?.id;
      if (userId) {
        writePendingAccountLanguage(userId, explicit);
        void saveAccountLanguage(userId, explicit).then(refresh);
      }
      refresh();
    },
    [refresh]
  );

  useEffect(() => {
    refresh();
    void syncAccount();

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === APP_LANGUAGE_STORAGE_KEY || event.key.startsWith("samarket_app_language_pending:")) {
        refresh();
      }
    };
    window.addEventListener("storage", onStorage);
    const unsubscribeSettings = subscribeUserSettings(({ userId }) => {
      if (userId === getCurrentUser()?.id) refresh();
    });
    /**
     * 로그인·로그아웃(새로고침 없는 전환 포함) — 문맥이 바뀌면 다시 계산.
     * 세션 모듈은 마운트 후 동적으로 불러온다: `useI18n` 만 쓰는 화면·테스트가 인증 모듈 전체를 끌어오지 않게.
     */
    let unsubscribePhase: () => void = () => undefined;
    let disposed = false;
    void import("@/lib/auth/dibay-session-manager").then(({ subscribeSessionPhase }) => {
      if (disposed) return;
      unsubscribePhase = subscribeSessionPhase((phase) => {
        if (phase === "authenticated") void syncAccount();
        else if (phase === "terminal_guest") refresh();
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("storage", onStorage);
      unsubscribeSettings();
      unsubscribePhase();
    };
  }, [refresh, syncAccount]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      language,
      languagePreference,
      setLanguage,
      t: (key, vars) => safeTranslate(language, key, { vars }),
      safeT: (key, fallbacks) => {
        if (typeof fallbacks === "string") {
          return safeTranslate(language, key, { fallbackKo: fallbacks, fallbackEn: fallbacks });
        }
        return safeTranslate(language, key, fallbacks);
      },
      tt: (text, vars) => translateText(language, text, vars),
    }),
    [language, languagePreference, setLanguage]
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useI18n(): AppLanguageContextValue {
  const value = useContext(AppLanguageContext);
  if (!value) {
    const fallback = FALLBACK_APP_LANGUAGE;
    return {
      language: fallback,
      languagePreference: null,
      setLanguage: () => undefined,
      t: (key, vars) => safeTranslate(fallback, key, { vars }),
      safeT: (key, fallbacks) => {
        if (typeof fallbacks === "string") {
          return safeTranslate(fallback, key, { fallbackKo: fallbacks, fallbackEn: fallbacks });
        }
        return safeTranslate(fallback, key, fallbacks);
      },
      tt: (text, vars) => translateText(fallback, text, vars),
    };
  }
  return value;
}
