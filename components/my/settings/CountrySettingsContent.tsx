"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

type CountryOption = { code: string; name: string };

export function CountrySettingsContent() {
  const { t } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const fallbackCountries = useMemo(
    (): CountryOption[] => [
      { code: "PH", name: t("settings_country_ph") },
      { code: "KR", name: t("settings_country_kr") },
      { code: "US", name: t("settings_country_us") },
    ],
    [t]
  );
  const [list, setList] = useState<CountryOption[]>(fallbackCountries);
  const [current, setCurrent] = useState("PH");

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    if (supabase) {
      void supabase
        .from("app_supported_countries")
        .select("code,name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .then(({ data }) => {
          if (!cancelled && Array.isArray(data) && data.length > 0) {
            setList(data as CountryOption[]);
          }
        });
    }
    const applyCurrent = () => {
      const s = getUserSettings(userId);
      setCurrent(s.preferred_country ?? "PH");
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
  }, [userId]);

  const select = useCallback(
    (code: string) => {
      updateUserSettings(userId, { preferred_country: code });
      setCurrent(code);
    },
    [userId]
  );

  return (
    <ul className="divide-y divide-sam-border-soft">
      {list.map((c) => (
        <li key={c.code}>
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left sam-text-body text-sam-fg"
            onClick={() => select(c.code)}
          >
            <span>{c.name}</span>
            {current === c.code && (
              <span className="sam-text-body-secondary font-medium text-signature">{t("common_selected")}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
