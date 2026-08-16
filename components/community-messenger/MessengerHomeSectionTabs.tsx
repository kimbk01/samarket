"use client";

import { UserPlus2 } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
} from "@/lib/ui/tier1-header-icon";
import {
  MESSENGER_MAIN_SECTION_TAB_ORDER,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import {
  DIBAY_SECONDARY_TAB_LABEL_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

const SECTION_TAB_LABEL_KEYS: Record<MessengerMainSection, MessageKey> = {
  friends: "cm_ia_messenger_tab_friends_list",
  call_logs: "cm_ia_messenger_tab_call_logs",
  chats: "cm_ia_messenger_tab_home",
  open_chat: "cm_ia_messenger_tab_meeting_room",
  archive: "cm_ia_messenger_tab_archive",
};

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  onOpenGroupCreate: () => void;
};

/**
 * Messenger home section tabs — Community / Trade 와 동일 DibaySecondaryTabRow SSOT.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  onOpenGroupCreate,
}: Props) {
  const { t } = useI18n();

  return (
    <DibaySecondaryTabRow
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      bordered
      trackAriaLabel={t("cm_ui_messenger_section_aria")}
      trailing={
        mainSection === "chats" ? (
          <button
            type="button"
            onClick={onOpenGroupCreate}
            className="inline-flex h-[length:var(--dibay-secondary-tab-item-h,36px)] w-[length:var(--dibay-secondary-tab-item-h,36px)] shrink-0 items-center justify-center rounded-ui-rect border border-[color:var(--dibay-domain-divider,var(--sam-border))] bg-[color:var(--dibay-domain-tab-idle-bg,var(--sam-surface))] text-[color:var(--dibay-domain-tab-idle-fg,var(--sam-fg))] transition active:scale-[0.98]"
            aria-label={t("cm_ui_create_group")}
          >
            <UserPlus2
              className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
              strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
              aria-hidden
            />
          </button>
        ) : null
      }
    >
      {MESSENGER_MAIN_SECTION_TAB_ORDER.map((section) => {
        const active = mainSection === section;
        return (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            className={dibaySecondaryTabClass(active)}
            onClick={() => onPrimarySectionChange(section)}
          >
            <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>
              {t(SECTION_TAB_LABEL_KEYS[section])}
            </span>
          </button>
        );
      })}
    </DibaySecondaryTabRow>
  );
}
