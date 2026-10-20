"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
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

  /** 행 탭 = 즉시 저장 — 실패 시 스토어가 원래 값으로 되돌리고(구독으로 표시 복귀) 토스트(S13) */
  const select = useCallback(
    (code: string) => {
      setCurrent(code);
      void updateUserSettings(userId, { preferred_country: code });
    },
    [userId]
  );

  return (
    <ul
      className="divide-y divide-sam-border-soft overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
      role="radiogroup"
    >
      {list.map((c) => {
        const selected = current === c.code;
        return (
          <li key={c.code}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              className="flex min-h-[52px] w-full items-center justify-between px-4 py-3 text-left text-[15px] font-semibold text-sam-fg transition-colors active:bg-sam-pressed-surface md:px-5"
              onClick={() => select(c.code)}
            >
              <span>{c.name}</span>
              {selected ? (
                <Check className="h-[18px] w-[18px] text-sam-primary" strokeWidth={2.5} aria-label={t("common_selected")} />
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
