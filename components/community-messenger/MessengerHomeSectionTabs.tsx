"use client";

import { UserPlus2 } from "lucide-react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
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
import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

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
 * Messenger home section tabs — visual SSOT pill rail.
 * Existing section handlers + trailing group create preserved.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  onOpenGroupCreate,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      className="min-w-0 w-full overflow-x-hidden bg-[color:var(--dibay-domain-surface,var(--messenger-bg))]"
    >
      <div className="flex min-w-0 items-center gap-1">
        <HorizontalDragScroll
          className={`${DIBAY_SECONDARY_TABS_CLASS} min-w-0 flex-1 border-b-0`}
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label={t("cm_ui_messenger_section_aria")}
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
                <span className="min-w-0 max-w-[min(9rem,38vw)] truncate">
                  {t(SECTION_TAB_LABEL_KEYS[section])}
                </span>
              </button>
            );
          })}
        </HorizontalDragScroll>
        {mainSection === "chats" ? (
          <button
            type="button"
            onClick={onOpenGroupCreate}
            className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sam-fg transition active:scale-[0.98]"
            aria-label={t("cm_ui_create_group")}
          >
            <UserPlus2
              className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
              strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
