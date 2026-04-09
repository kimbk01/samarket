"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  getUserSettings,
  subscribeUserSettings,
  syncUserSettings,
  updateUserSettings,
} from "@/lib/settings/user-settings-store";

const FALLBACK_COUNTRIES = [
  { code: "PH", name: "필리핀" },
  { code: "KR", name: "한국" },
  { code: "US", name: "미국" },
];

export function CountrySettingsContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [list, setList] = useState(FALLBACK_COUNTRIES);
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
            setList(data as typeof FALLBACK_COUNTRIES);
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
    <ul className="divide-y divide-gray-100">
      {list.map((c) => (
        <li key={c.code}>
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left text-[15px] text-gray-900"
            onClick={() => select(c.code)}
          >
            <span>{c.name}</span>
            {current === c.code && (
              <span className="text-[13px] font-medium text-signature">선택됨</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
