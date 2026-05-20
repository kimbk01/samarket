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
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import {
  APP_LANGUAGE_CHANGED_EVENT,
  APP_LANGUAGE_STORAGE_KEY,
  getBrowserLanguage,
  parseExplicitAppLanguage,
  type AppLanguageCode,
  type StoredPreferredLanguage,
} from "@/lib/i18n/config";
import {
  clearLanguagePersistence,
  getStoredLanguagePreference,
  persistExplicitLanguage,
  readExplicitLanguageCookie,
  readExplicitLocalLanguage,
  resolveAuthenticatedAppLanguageCode,
  resolveGuestAppLanguageCode,
} from "@/lib/i18n/language-preference";
import { translate, translateText, type MessageKey } from "@/lib/i18n/messages";
import { resolveSafeMessageKey } from "@/lib/i18n/safe-ui-label";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

type AppLanguageContextValue = {
  language: AppLanguageCode;
  /** null = 기기 언어 따름(명시 ko/en 미선택) */
  languagePreference: StoredPreferredLanguage;
  setLanguage: (language: AppLanguageCode) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  /** UI 표시용 — key·토큰 노출 방지, ko 폴백 */
  safeT: (key: MessageKey, fallbackLabel?: string) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function resolveClientAppLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return getBrowserLanguage();
  const userId = getCurrentUser()?.id;
  if (!userId) {
    return resolveGuestAppLanguageCode({
      localStorageValue: window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY),
      cookieValue: readExplicitLanguageCookie(),
      browserDetect: getBrowserLanguage,
    });
  }
  return resolveAuthenticatedAppLanguageCode({
    preferredLanguage: getUserSettings(userId).preferred_language,
    localStorageValue: window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY),
    cookieValue: readExplicitLanguageCookie(),
    browserDetect: getBrowserLanguage,
  });
}

function resolveClientStoredPreference(): StoredPreferredLanguage {
  if (typeof window === "undefined") return null;
  const userId = getCurrentUser()?.id;
  if (userId) {
    return getStoredLanguagePreference(getUserSettings(userId).preferred_language);
  }
  return readExplicitLocalLanguage() ?? readExplicitLanguageCookie();
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
  initialLanguage = getBrowserLanguage(),
}: {
  children: ReactNode;
  /** 서버에서 읽은 쿠키·Accept-Language와 동일해야 하이드레이션이 깨지지 않음 */
  initialLanguage?: AppLanguageCode;
}) {
  const [language, setLanguageState] = useState<AppLanguageCode>(
    () => parseExplicitAppLanguage(initialLanguage) ?? getBrowserLanguage()
  );

  useEffect(() => {
    setRuntimeAppLanguage(language);
  }, [language]);
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

      const remoteSettings = await syncUserSettings(userId).catch(() => null);
      if (cancelled) return;

      const stored = getStoredLanguagePreference(remoteSettings?.preferred_language);
      const explicit = parseExplicitAppLanguage(remoteSettings?.preferred_language);

      if (explicit) {
        persistExplicitLanguage(explicit);
        applyResolvedLanguage(explicit, explicit);
        return;
      }

      clearLanguagePersistence();
      const resolved = resolveAuthenticatedAppLanguageCode({
        preferredLanguage: stored,
        browserDetect: getBrowserLanguage,
      });
      applyResolvedLanguage(null, resolved);
    }

    void syncSettingsLanguage();

    const onLanguageChanged = (event: Event) => {
      const next = parseExplicitAppLanguage(
        (event as CustomEvent<AppLanguageCode | undefined>).detail
      );
      if (next) setLanguageState(next);
      else setLanguageState(getBrowserLanguage());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      const explicit = parseExplicitAppLanguage(event.newValue);
      if (explicit) setLanguageState(explicit);
      else setLanguageState(getBrowserLanguage());
    };

    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
    window.addEventListener("storage", onStorage);
    const unsubscribeSettings = subscribeUserSettings(({ userId, settings }) => {
      if (userId !== getCurrentUser()?.id) return;
      const stored = getStoredLanguagePreference(settings.preferred_language);
      setLanguagePreferenceState(stored);
      const explicit = parseExplicitAppLanguage(settings.preferred_language);
      if (explicit) {
        setLanguageState(explicit);
        return;
      }
      setLanguageState(getBrowserLanguage());
    });

    const sb = getSupabaseClient();
    const authSubscription = sb?.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      clearLanguagePersistence();
      applyResolvedLanguage(null, getBrowserLanguage());
    });

    return () => {
      cancelled = true;
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
      window.removeEventListener("storage", onStorage);
      unsubscribeSettings();
      authSubscription?.data.subscription.unsubscribe();
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
      t: (key, vars) => translate(language, key, vars),
      safeT: (key, fallbackLabel) => resolveSafeMessageKey(language, key, fallbackLabel),
      tt: (text, vars) => translateText(language, text, vars),
    }),
    [language, languagePreference, setLanguage]
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useI18n(): AppLanguageContextValue {
  const value = useContext(AppLanguageContext);
  if (!value) {
    const fallback = getBrowserLanguage();
    return {
      language: fallback,
      languagePreference: null,
      setLanguage: () => undefined,
      t: (key, vars) => translate(fallback, key, vars),
      safeT: (key, fallbackLabel) => resolveSafeMessageKey(fallback, key, fallbackLabel),
      tt: (text, vars) => translateText(fallback, text, vars),
    };
  }
  return value;
}
