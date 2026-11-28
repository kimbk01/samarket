"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useClientMemberId } from "@/hooks/use-client-membership-state";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

type CountryOption = { code: string; name: string };

export function CountrySettingsContent() {
  const { t } = useI18n();
  /** 지금 보는 회원 id = 회원 상태 SSOT — 모르면 설정을 읽거나 쓰지 않는다(예전 "me" 대체 키는 기기 캐시를 실제 회원 키와 갈라 놓았다 — 관심이웃 전체 수정 설계 v2 §6) */
  const userId = useClientMemberId("settings-country") ?? "";
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
    if (!userId) return;
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
      if (!userId) return;
      setCurrent(code);
      void updateUserSettings(userId, { preferred_country: code });
    },
    [userId]
  );

  if (!userId) return null;

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
