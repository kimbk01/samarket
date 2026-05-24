"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";
import { I18N_COMPACT_CHIP_LABEL } from "@/lib/ui/i18n-compact-label-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const SECTIONS: MessengerMainSection[] = ["friends", "chats", "open_chat", "archive"];

const SECTION_LABEL_KEYS: Record<MessengerMainSection, MessageKey> = {
  friends: "cm_ia_section_friends",
  chats: "cm_ia_section_chats",
  open_chat: "cm_ia_section_open_chat",
  archive: "cm_ia_section_archive",
};

export type MessengerTabsProps = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/** 메신저 1차 탭 — `TradePrimaryTabs` embed 와 동일 셸·`sam-tab` 밑줄 활성. */
export function MessengerTabs({ value, onChange }: MessengerTabsProps) {
  const { t } = useI18n();
  return (
    <div
      data-cm-primary-nav
      className={`${APP_MAIN_GUTTER_NEG_X_CLASS} min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface`}
    >
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <HorizontalDragScroll
          className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label={t("cm_ui_messenger_section_aria")}
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
                className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
              >
                <span className={I18N_COMPACT_CHIP_LABEL}>{t(SECTION_LABEL_KEYS[id])}</span>
              </button>
            );
          })}
        </HorizontalDragScroll>
      </div>
    </div>
  );
}
