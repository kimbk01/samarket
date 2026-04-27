"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { getUserSettings, subscribeUserSettings, syncUserSettings, updateUserSettings } from "@/lib/settings/user-settings-store";
import { updateMyProfile } from "@/lib/profile/updateMyProfile";

export function AdminLanguageToggle() {
  const { setLanguage } = useI18n();
  const userId = getCurrentUser()?.id ?? "me";
  const [current, setCurrent] = useState<AppLanguageCode>(() =>
    normalizeAppLanguage(getUserSettings(userId).preferred_language)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const apply = () => {
      setCurrent(normalizeAppLanguage(getUserSettings(userId).preferred_language));
    };
    apply();
    void syncUserSettings(userId).then(() => apply());
    return subscribeUserSettings(({ userId: changedUserId }) => {
      if (changedUserId === userId) apply();
    });
  }, [userId]);

  const changeLanguage = useCallback(
    async (next: AppLanguageCode) => {
      if (busy || current === next) return;
      setBusy(true);
      const previous = current;
      setCurrent(next);
      setLanguage(next);
      updateUserSettings(userId, { preferred_language: next });
      const result = await updateMyProfile({ preferred_language: next });
      if (!result.ok) {
        setCurrent(previous);
        setLanguage(previous);
        updateUserSettings(userId, { preferred_language: previous });
      }
      setBusy(false);
    },
    [busy, current, setLanguage, userId]
  );

  return (
    <div className="inline-flex h-9 w-[152px] shrink-0 items-center rounded-full border border-[#1877F2]/25 bg-[#1877F2]/10 p-1">
      <button
        type="button"
        disabled={busy}
        aria-pressed={current === "ko"}
        onClick={() => void changeLanguage("ko")}
        className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
          current === "ko" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
        }`}
      >
        한국어
      </button>
      <button
        type="button"
        disabled={busy}
        aria-pressed={current === "en"}
        onClick={() => void changeLanguage("en")}
        className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
          current === "en" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
        }`}
      >
        Language
      </button>
    </div>
  );
}
