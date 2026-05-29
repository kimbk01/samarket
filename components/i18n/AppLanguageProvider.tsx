"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
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
  getStoredLanguagePreference,
  persistExplicitLanguage,
  readGuestExplicitAppLanguage,
  readLoggedInExplicitAppLanguage,
  resolveClientAppLanguageCode,
} from "@/lib/i18n/language-preference";
import { translateText, type MessageKey } from "@/lib/i18n/messages";
import { safeTranslate, type SafeTranslateOptions } from "@/lib/i18n/safe-translate";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

type AppLanguageContextValue = {
  language: AppLanguageCode;
  /** null = 기기 언어 따름(명시 ko/en 미선택) */
  languagePreference: StoredPreferredLanguage;
  setLanguage: (language: AppLanguageCode) => void;
  /** UI 표시용 — key·빈값·미치환 placeholder 노출 방지 (전역 기본) */
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** `fallbackKo` / `fallbackEn` 를 명시할 때 */
  safeT: (key: MessageKey, fallbacks?: string | SafeTranslateOptions) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function readLoggedInExplicitLanguage(userId: string): AppLanguageCode | null {
  return readLoggedInExplicitAppLanguage(
    peekUserSettingsSnapshot(userId).preferred_language
  );
}

function resolveClientAppLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return FALLBACK_APP_LANGUAGE;
  const userId = getCurrentUser()?.id;
  return resolveClientAppLanguageCode({
    isLoggedIn: Boolean(userId),
    cachedPreferredLanguage: userId
      ? peekUserSettingsSnapshot(userId).preferred_language
      : undefined,
  });
}

function resolveClientStoredPreference(): StoredPreferredLanguage {
  if (typeof window === "undefined") return null;
  const userId = getCurrentUser()?.id;
  if (userId) {
    return getStoredLanguagePreference(peekUserSettingsSnapshot(userId).preferred_language);
  }
  return readGuestExplicitAppLanguage();
}

function emitLanguageChanged(language: AppLanguageCode): void {
  window.dispatchEvent(
    new CustomEvent<AppLanguageCode>(APP_LANGUAGE_CHANGED_EVENT, {
      detail: language,
    })
  );
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

  const applyResolvedLanguage = useCallback(
    (preference: StoredPreferredLanguage, resolved: AppLanguageCode) => {
      setLanguagePreferenceState(preference);
      setLanguageState(resolved);
      setRuntimeAppLanguage(resolved);
      emitLanguageChanged(resolved);
    },
    []
  );

  const setLanguage = useCallback(
    (next: AppLanguageCode) => {
      const explicit = parseExplicitAppLanguage(next);
      if (!explicit) return;

      persistExplicitLanguage(explicit);
      const userId = getCurrentUser()?.id;
      if (userId) {
        updateUserSettings(userId, { preferred_language: explicit });
      }
      applyResolvedLanguage(explicit, explicit);
    },
    [applyResolvedLanguage]
  );

  useEffect(() => {
    let cancelled = false;

    const applyFromResolved = () => {
      const resolved = resolveClientAppLanguage();
      setLanguageState((prev) => (prev === resolved ? prev : resolved));
      setLanguagePreferenceState(resolveClientStoredPreference());
    };

    applyFromResolved();

    async function syncSettingsLanguage() {
      const userId = getCurrentUser()?.id;
      if (!userId) return;

      const localExplicit = readLoggedInExplicitLanguage(userId);

      const remoteSettings = await syncUserSettings(userId).catch(() => null);
      if (cancelled) return;

      const remoteExplicit = parseExplicitAppLanguage(remoteSettings?.preferred_language);

      if (remoteExplicit) {
        persistExplicitLanguage(remoteExplicit);
        applyResolvedLanguage(remoteExplicit, remoteExplicit);
        return;
      }

      if (localExplicit) {
        persistExplicitLanguage(localExplicit);
        applyResolvedLanguage(localExplicit, localExplicit);
        return;
      }

      const resolved = resolveClientAppLanguageCode({
        isLoggedIn: true,
        cachedPreferredLanguage: null,
      });
      applyResolvedLanguage(null, resolved);
    }

    void syncSettingsLanguage();

    const onLanguageChanged = (event: Event) => {
      const next = parseExplicitAppLanguage(
        (event as CustomEvent<AppLanguageCode | undefined>).detail
      );
      if (next) {
        setLanguageState(next);
        setRuntimeAppLanguage(next);
        return;
      }
      const resolved = resolveClientAppLanguage();
      setLanguageState(resolved);
      setRuntimeAppLanguage(resolved);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      const explicit = parseExplicitAppLanguage(event.newValue);
      if (explicit) {
        setLanguageState(explicit);
        setRuntimeAppLanguage(explicit);
        return;
      }
      const resolved = resolveClientAppLanguage();
      setLanguageState(resolved);
      setRuntimeAppLanguage(resolved);
    };

    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
    window.addEventListener("storage", onStorage);
    const unsubscribeSettings = subscribeUserSettings(({ userId, settings }) => {
      if (userId !== getCurrentUser()?.id) return;
      const stored = getStoredLanguagePreference(settings.preferred_language);
      const explicit = parseExplicitAppLanguage(settings.preferred_language);
      if (explicit) {
        persistExplicitLanguage(explicit);
        setLanguagePreferenceState(explicit);
        setLanguageState(explicit);
        setRuntimeAppLanguage(explicit);
        return;
      }
      const localExplicit = readLoggedInExplicitLanguage(userId);
      if (localExplicit) {
        persistExplicitLanguage(localExplicit);
        setLanguagePreferenceState(localExplicit);
        setLanguageState(localExplicit);
        setRuntimeAppLanguage(localExplicit);
        return;
      }
      const resolved = resolveClientAppLanguageCode({
        isLoggedIn: true,
        cachedPreferredLanguage: settings.preferred_language,
      });
      setLanguagePreferenceState(stored);
      setLanguageState(resolved);
      setRuntimeAppLanguage(resolved);
    });

    return () => {
      cancelled = true;
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
      window.removeEventListener("storage", onStorage);
      unsubscribeSettings();
    };
  }, [applyResolvedLanguage]);

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
