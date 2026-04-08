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
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { getUserSettings, updateUserSettings } from "@/lib/settings/user-settings-store";
import {
  APP_LANGUAGE_CHANGED_EVENT,
  APP_LANGUAGE_COOKIE,
  APP_LANGUAGE_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  detectBrowserAppLanguage,
  normalizeAppLanguage,
  type AppLanguageCode,
} from "@/lib/i18n/config";
import { translate, translateText, type MessageKey } from "@/lib/i18n/messages";

type AppLanguageContextValue = {
  language: AppLanguageCode;
  setLanguage: (language: AppLanguageCode) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  tt: (text: string, vars?: Record<string, string | number>) => string;
};

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function resolveInitialLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return DEFAULT_APP_LANGUAGE;
  const stored = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  if (stored) return normalizeAppLanguage(stored);
  const userId = getCurrentUser()?.id;
  if (userId) {
    const userSettings = getUserSettings(userId);
    if (userSettings.preferred_language) {
      return normalizeAppLanguage(userSettings.preferred_language);
    }
  }
  return detectBrowserAppLanguage();
}

function persistLanguage(language: AppLanguageCode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  document.cookie = `${APP_LANGUAGE_COOKIE}=${encodeURIComponent(language)}; path=/; max-age=31536000; SameSite=Lax`;
  const userId = getCurrentUser()?.id;
  if (userId) {
    updateUserSettings(userId, { preferred_language: language });
  }
  window.dispatchEvent(
    new CustomEvent<AppLanguageCode>(APP_LANGUAGE_CHANGED_EVENT, {
      detail: language,
    })
  );
}

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguageCode>(DEFAULT_APP_LANGUAGE);

  useEffect(() => {
    setLanguageState(resolveInitialLanguage());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    async function syncProfileLanguage() {
      const userId = getCurrentUser()?.id;
      if (!userId) return;
      const profile = await getMyProfile().catch(() => null);
      if (cancelled || !profile?.preferred_language) return;
      const preferred = normalizeAppLanguage(profile.preferred_language);
      persistLanguage(preferred);
      setLanguageState(preferred);
    }

    void syncProfileLanguage();

    const onLanguageChanged = (event: Event) => {
      const next = normalizeAppLanguage(
        (event as CustomEvent<AppLanguageCode | undefined>).detail ?? DEFAULT_APP_LANGUAGE
      );
      setLanguageState(next);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
      setLanguageState(normalizeAppLanguage(event.newValue));
    };

    window.addEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener(APP_LANGUAGE_CHANGED_EVENT, onLanguageChanged as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguageCode) => {
    const resolved = normalizeAppLanguage(next);
    persistLanguage(resolved);
    setLanguageState(resolved);
  }, []);

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
      tt: (text, vars) => translateText(language, text, vars),
    }),
    [language, setLanguage]
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useI18n(): AppLanguageContextValue {
  const value = useContext(AppLanguageContext);
  if (!value) {
    return {
      language: DEFAULT_APP_LANGUAGE,
      setLanguage: () => undefined,
      t: (key, vars) => translate(DEFAULT_APP_LANGUAGE, key, vars),
      tt: (text, vars) => translateText(DEFAULT_APP_LANGUAGE, text, vars),
    };
  }
  return value;
}
