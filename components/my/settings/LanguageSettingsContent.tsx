"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getUserSettings, updateUserSettings, LANGUAGE_NAMES } from "@/lib/settings/user-settings-store";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";
import { normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";

const FALLBACK_LANGS = [
  { code: "ko", name: LANGUAGE_NAMES.ko },
  { code: "en", name: LANGUAGE_NAMES.en },
  { code: "zh-CN", name: LANGUAGE_NAMES["zh-CN"] },
];

export function LanguageSettingsContent() {
  const { language, setLanguage, t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [list, setList] = useState(FALLBACK_LANGS);
  const [current, setCurrent] = useState<AppLanguageCode>(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = getUserSettings(userId);
    setCurrent(normalizeAppLanguage(s.preferred_language ?? language));
    setList(FALLBACK_LANGS);
  }, [language, userId]);

  const select = useCallback(
    async (code: AppLanguageCode) => {
      if (busy || code === current) return;
      setBusy(true);
      setError("");
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
      setBusy(false);
    },
    [busy, current, setLanguage, userId]
  );

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100">
        {list.map((c) => (
          <li key={c.code}>
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center justify-between py-3 text-left text-[15px] text-gray-900 disabled:opacity-60"
              onClick={() => void select(c.code as AppLanguageCode)}
            >
              <span>{c.name}</span>
              {current === c.code && (
                <span className="text-[13px] font-medium text-signature">{t("common_selected")}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
    </div>
  );
}
