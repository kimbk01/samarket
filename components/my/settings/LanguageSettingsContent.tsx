"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  getUserSettings,
  LANGUAGE_NAMES,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";
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
    let cancelled = false;
    const supabase = getSupabaseClient();
    if (supabase) {
      void supabase
        .from("app_supported_languages")
        .select("code,name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .then(({ data }) => {
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setList(data as typeof FALLBACK_LANGS);
          } else {
            setList(FALLBACK_LANGS);
          }
        });
    } else {
      setList(FALLBACK_LANGS);
    }
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
      <ul className="divide-y divide-sam-border-soft">
        {list.map((c) => (
          <li key={c.code}>
            <button
              type="button"
              disabled={busy}
              className="flex w-full items-center justify-between py-3 text-left text-[15px] text-sam-fg disabled:opacity-60"
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
