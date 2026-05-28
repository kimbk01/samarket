"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  peekUserSettingsSnapshot,
  subscribeUserSettings,
  syncUserSettings,
} from "@/lib/settings/user-settings-store";
import { SUPPORTED_APP_LANGUAGES, type AppLanguageCode } from "@/lib/i18n/config";

const CHOICES = SUPPORTED_APP_LANGUAGES;

function choiceLabel(
  choice: AppLanguageCode,
  t: (key: import("@/lib/i18n/messages").MessageKey) => string
): string {
  if (choice === "ko") return t("mypage_korean");
  return t("mypage_english");
}

/** 앱 UI 언어 — source of truth: user_settings + AppLanguageProvider (profiles 미사용) */
export function LanguageSettingsContent() {
  const { language, languagePreference, setLanguage, t } = useI18n();
  const activeLanguage = languagePreference ?? language;
  const userId = getCurrentUser()?.id ?? "me";
  const [current, setCurrent] = useState<AppLanguageCode>(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    setCurrent(activeLanguage);
  }, [activeLanguage]);

  useEffect(() => {
    const applyCurrent = () => {
      const explicit = peekUserSettingsSnapshot(userId).preferred_language;
      if (explicit === "ko" || explicit === "en") setCurrent(explicit);
      else setCurrent(activeLanguage);
    };
    applyCurrent();
    void syncUserSettings(userId).then(() => applyCurrent());
    const unsubscribe = subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) applyCurrent();
    });
    return unsubscribe;
  }, [activeLanguage, userId]);

  const select = useCallback(
    async (choice: AppLanguageCode) => {
      if (busy || choice === current) return;
      setBusy(true);
      setError("");
      setSavedHint(false);
      setCurrent(choice);
      setLanguage(choice);
      setBusy(false);
      setSavedHint(true);
    },
    [busy, current, setLanguage]
  );

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-meta">{t("language_settings_subtitle")}</p>
      <div className="flex w-full max-w-[420px] flex-col gap-2">
        {CHOICES.map((choice) => {
          const active = current === choice;
          return (
            <button
              key={choice}
              type="button"
              disabled={busy}
              aria-pressed={active}
              className={`flex h-11 w-full items-center justify-between rounded-ui-rect border px-4 transition-colors disabled:opacity-60 ${
                active
                  ? "border-[#1877F2] bg-[#1877F2]/10 text-sam-fg"
                  : "border-sam-border bg-sam-surface text-sam-muted hover:border-sam-border-strong hover:text-sam-fg"
              }`}
              onClick={() => void select(choice)}
            >
              <span className="sam-text-body font-semibold">{choiceLabel(choice, t)}</span>
              {active ? <span className="text-[#1877F2]">✓</span> : null}
            </button>
          );
        })}
      </div>
      {savedHint ? (
        <p className="sam-text-helper text-sam-meta">{t("mypage_language_saved")}</p>
      ) : (
        <p className="sam-text-helper text-sam-meta">{t("common_selected")}</p>
      )}
      {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
    </div>
  );
}
