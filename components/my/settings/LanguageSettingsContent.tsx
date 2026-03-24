"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getUserSettings, updateUserSettings, LANGUAGE_NAMES } from "@/lib/settings/user-settings-store";

const FALLBACK_LANGS = [
  { code: "ko", name: LANGUAGE_NAMES.ko },
  { code: "en", name: LANGUAGE_NAMES.en },
  { code: "ja", name: LANGUAGE_NAMES.ja },
];

export function LanguageSettingsContent() {
  const userId = getCurrentUser()?.id ?? "me";
  const [list, setList] = useState(FALLBACK_LANGS);
  const [current, setCurrent] = useState("ko");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (supabase) {
      // TODO: supabase.from('app_supported_languages').select('code,name').eq('is_active', true).order('sort_order')
    }
    const s = getUserSettings(userId);
    setCurrent(s.preferred_language ?? "ko");
  }, [userId]);

  const select = useCallback(
    (code: string) => {
      updateUserSettings(userId, { preferred_language: code });
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
