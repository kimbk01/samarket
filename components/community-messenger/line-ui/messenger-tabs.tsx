"use client";

import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import type { MessageKey } from "@/lib/i18n/messages";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { I18N_COMPACT_CHIP_LABEL } from "@/lib/ui/i18n-compact-label-classes";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

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

/** 메신저 1차 탭 — DIBAY secondary visual SSOT. Handlers unchanged. */
export function MessengerTabs({ value, onChange }: MessengerTabsProps) {
  const { t } = useI18n();
  return (
    <div
      data-cm-primary-nav
      className={`${APP_MAIN_GUTTER_NEG_X_CLASS} min-w-0 overflow-x-hidden bg-[color:var(--dibay-domain-surface,var(--sam-bg-surface))]`}
    >
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <HorizontalDragScroll
          className={`${DIBAY_SECONDARY_TABS_CLASS} min-w-0 max-w-full border-b-0 bg-transparent px-0`}
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
                className={dibaySecondaryTabClass(active)}
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
