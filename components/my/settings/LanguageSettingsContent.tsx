"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  LANGUAGE_NAMES,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import { normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";

const LANGUAGE_SEGMENTS: Array<{ code: AppLanguageCode; name: string }> = [
  { code: "ko", name: LANGUAGE_NAMES.ko },
  { code: "en", name: LANGUAGE_NAMES.en },
];

export function LanguageSettingsContent() {
  const { language, setLanguage, t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [current, setCurrent] = useState<AppLanguageCode>(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const applyCurrent = () => {
      const s = getUserSettings(userId);
      setCurrent(normalizeAppLanguage(s.preferred_language ?? language));
    };
    applyCurrent();
    void syncUserSettings(userId).then(() => applyCurrent());
    const unsubscribe = subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) applyCurrent();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [language, userId]);

  const select = useCallback(
    async (code: AppLanguageCode) => {
      if (busy || code === current) return;
      setBusy((prev) => (prev ? prev : true));
      setError((prev) => (prev === "" ? prev : ""));
      const previous = current;
      setCurrent(code);
      setLanguage(code);
      updateUserSettings(userId, { preferred_language: code });
      const result = await updateMyProfile({ preferred_language: code });
      if (!result.ok) {
        setCurrent(previous);
        setLanguage(previous);
        updateUserSettings(userId, { preferred_language: previous });
        setError(result.error);
      }
      setBusy((prev) => (prev ? false : prev));
    },
    [busy, current, setLanguage, userId]
  );

  return (
    <div className="space-y-3">
      <div className="flex w-full max-w-[420px] items-center gap-3">
        {LANGUAGE_SEGMENTS.map((c) => {
          const active = current === c.code;
          return (
            <button
              key={c.code}
              type="button"
              disabled={busy}
              aria-pressed={active}
              className={`group relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-full border px-4 transition-all duration-150 disabled:opacity-60 ${
                active
                  ? "border-transparent bg-gradient-to-r from-fuchsia-500 via-orange-400 to-amber-300 text-white shadow-[0_6px_18px_rgba(219,39,119,0.28)]"
                  : "border-sam-border bg-sam-surface text-sam-muted hover:border-sam-border-strong hover:text-sam-fg"
              }`}
              onClick={() => void select(c.code as AppLanguageCode)}
            >
              <span className={`truncate sam-text-body font-semibold ${active ? "pr-8" : ""}`}>{c.name}</span>
              {active ? (
                <span className="absolute right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white text-amber-500 shadow-sm">
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="sam-text-helper text-sam-meta">{t("common_selected")}</p>
      {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
    </div>
  );
}
