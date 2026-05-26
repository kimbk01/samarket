"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
  MYPAGE_HOME_SEGMENT_BTN_ACTIVE_CLASS,
  MYPAGE_HOME_SEGMENT_BTN_CLASS,
  MYPAGE_HOME_SEGMENT_BTN_INACTIVE_CLASS,
  MYPAGE_HOME_SEGMENT_WRAP_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

const LANGUAGE_OPTIONS: {
  code: AppLanguageCode;
  labelKey: MessageKey;
  ariaKey: MessageKey;
}[] = [
  { code: "ko", labelKey: "mypage_comp_language_segment_ko", ariaKey: "mypage_comp_language_segment_ko_aria" },
  { code: "en", labelKey: "mypage_comp_language_segment_en", ariaKey: "mypage_comp_language_segment_en_aria" },
];

/** 내정보 홈 — 언어 설정 페이지 이동 없이 한글/English 세그먼트 선택 */
export function MyInfoLanguageToggleRow({
  icon,
  first = false,
}: {
  icon?: ReactNode;
  first?: boolean;
}) {
  const { language, setLanguage, t } = useI18n();
  const groupLabel = t("mypage_comp_menu_account_language_title");

  return (
    <div
      className={`${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS}`}
      role="group"
      aria-label={groupLabel}
    >
      {icon ? <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{icon}</span> : null}
      <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>{groupLabel}</span>
      <div className={MYPAGE_HOME_SEGMENT_WRAP_CLASS} role="radiogroup" aria-label={groupLabel}>
        {LANGUAGE_OPTIONS.map((option) => {
          const active = language === option.code;
          return (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t(option.ariaKey)}
              className={`${MYPAGE_HOME_SEGMENT_BTN_CLASS} ${
                active ? MYPAGE_HOME_SEGMENT_BTN_ACTIVE_CLASS : MYPAGE_HOME_SEGMENT_BTN_INACTIVE_CLASS
              }`}
              onClick={() => {
                if (!active) setLanguage(option.code);
              }}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
