"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SUPPORTED_APP_LANGUAGES, type AppLanguageCode } from "@/lib/i18n/config";

const CHOICES = SUPPORTED_APP_LANGUAGES;

function choiceLabel(
  choice: AppLanguageCode,
  t: (key: import("@/lib/i18n/messages").MessageKey) => string
): string {
  if (choice === "ko") return t("mypage_korean");
  return t("mypage_english");
}

/** 앱 UI 언어 — 선택 표시는 지금 화면 언어 하나만 본다 (`docs/i18n-ssot.md` §2, Provider 가 결정) */
export function LanguageSettingsContent() {
  const { language, setLanguage, t } = useI18n();
  const [savedHint, setSavedHint] = useState(false);

  const select = useCallback(
    (choice: AppLanguageCode) => {
      if (choice === language) return;
      setLanguage(choice);
      setSavedHint(true);
    },
    [language, setLanguage]
  );

  return (
    <div className="space-y-3">
      <p className="sam-text-helper text-sam-meta">{t("language_settings_subtitle")}</p>
      <div className="flex w-full flex-col gap-2">
        {CHOICES.map((choice) => {
          const active = language === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              className={`flex h-11 w-full items-center justify-between rounded-ui-rect border px-4 transition-colors disabled:opacity-60 ${
                active
                  ? "border-sam-primary bg-sam-pressed-surface text-sam-fg"
                  : "border-sam-border bg-sam-surface text-sam-muted hover:border-sam-border-strong hover:text-sam-fg"
              }`}
              onClick={() => select(choice)}
            >
              <span className="sam-text-body font-semibold">{choiceLabel(choice, t)}</span>
              {active ? <span className="text-sam-primary">✓</span> : null}
            </button>
          );
        })}
      </div>
      {savedHint ? (
        <p className="sam-text-helper text-sam-meta">{t("mypage_language_saved")}</p>
      ) : (
        <p className="sam-text-helper text-sam-meta">{t("common_selected")}</p>
      )}
    </div>
  );
}
