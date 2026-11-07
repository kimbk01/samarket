"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";

/** 선택 표시는 지금 화면 언어 하나만 본다 (`docs/i18n-ssot.md` §2) */
export function AdminLanguageToggle() {
  const { language: current, setLanguage, t } = useI18n();

  const changeLanguage = useCallback(
    (next: AppLanguageCode) => {
      if (current === next) return;
      setLanguage(next);
    },
    [current, setLanguage]
  );

  return (
    <div className="inline-flex h-9 w-[152px] shrink-0 items-center rounded-full border border-[#1877F2]/25 bg-[#1877F2]/10 p-1">
      <button
        type="button"
        aria-pressed={current === "ko"}
        onClick={() => changeLanguage("ko")}
        className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
          current === "ko" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
        }`}
      >
        {t("language_korean")}
      </button>
      <button
        type="button"
        aria-pressed={current === "en"}
        onClick={() => changeLanguage("en")}
        className={`h-7 flex-1 rounded-full text-center text-[12px] font-semibold transition-colors disabled:opacity-60 ${
          current === "en" ? "bg-[#1877F2] text-white" : "text-[#1877F2] hover:bg-white/60"
        }`}
      >
        {t("language_english")}
      </button>
    </div>
  );
}
