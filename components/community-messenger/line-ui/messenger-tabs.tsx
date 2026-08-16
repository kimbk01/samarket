"use client";

import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const SECTIONS = MESSENGER_MAIN_SECTION_TAB_ORDER;

const SECTION_LABEL_KEYS: Record<MessengerMainSection, MessageKey> = {
  friends: "cm_ia_section_friends",
  chats: "cm_ia_section_chats",
  open_chat: "cm_ia_section_open_chat",
  archive: "cm_ia_section_archive",
  call_logs: "cm_ia_section_call_logs",
};

export type MessengerTabsProps = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/** 메신저 1차 탭 — DibaySecondaryTabRow SSOT (MessengerHomeSectionTabs 와 동일 기하). */
export function MessengerTabs({ value, onChange }: MessengerTabsProps) {
  const { t } = useI18n();
  return (
    <DibaySecondaryTabRow
      data-cm-primary-nav
      bordered
      trackAriaLabel={t("cm_ui_messenger_section_aria")}
    >
      {SECTIONS.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={dibaySecondaryTabClass(active)}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t(SECTION_LABEL_KEYS[id])}</span>
          </button>
        );
      })}
    </DibaySecondaryTabRow>
  );
}
