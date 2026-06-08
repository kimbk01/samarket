"use client";

import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import {
  APP_MAIN_GUTTER_NEG_X_CLASS,
  APP_MAIN_HEADER_INNER_CLASS,
} from "@/lib/ui/app-content-layout";
import { Sam } from "@/lib/ui/sam-component-classes";

type SectionTabId = "friends" | "add_friend" | "call_logs" | "open_chat" | "archive";

type TabDef = {
  id: SectionTabId;
  section: MessengerMainSection | null;
  labelKey: MessageKey;
  action?: "add_friend";
};

const TABS: TabDef[] = [
  { id: "friends", section: "friends", labelKey: "cm_ia_messenger_tab_friends_list" },
  { id: "add_friend", section: null, labelKey: "cm_ia_messenger_tab_add_friend", action: "add_friend" },
  { id: "call_logs", section: "call_logs", labelKey: "cm_ia_messenger_tab_call_logs" },
  { id: "open_chat", section: "open_chat", labelKey: "cm_ia_messenger_tab_meeting_room" },
  { id: "archive", section: "archive", labelKey: "cm_ia_messenger_tab_archive" },
];

/** 좌측 칩 탭 — gap-2·shrink-0·whitespace-nowrap 으로 영문 라벨 줄바꿈 방지 */
function sectionTabChipClass(active: boolean): string {
  const base = "shrink-0 whitespace-nowrap !px-3.5 text-[12px] leading-none touch-manipulation";
  return active ? `${Sam.chip.activeCombo} ${base}` : `${Sam.chip.inactiveCombo} ${base}`;
}

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  onOpenFriendManager: () => void;
  incomingRequestCount?: number;
};

/**
 * 메신저 홈 2단 섹션 탭 — 친구목록·친구추가·통화목록·모임방·보관함.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  onOpenFriendManager,
  incomingRequestCount = 0,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      className={`${APP_MAIN_GUTTER_NEG_X_CLASS} sticky top-0 z-20 min-w-0 overflow-x-hidden bg-[color:var(--messenger-bg)]`}
    >
      <div className={`${APP_MAIN_HEADER_INNER_CLASS} py-2`}>
        <HorizontalDragScroll
          className="flex min-w-0 max-w-full items-center justify-start gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label={t("cm_ui_messenger_section_aria")}
        >
          {TABS.map((tab) => {
            const isAction = tab.action === "add_friend";
            const active = !isAction && tab.section != null && mainSection === tab.section;
            const showBadge = tab.id === "archive" && incomingRequestCount > 0;

            if (isAction) {
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={false}
                  className={sectionTabChipClass(false)}
                  onClick={onOpenFriendManager}
                >
                  {t(tab.labelKey)}
                </button>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                className={sectionTabChipClass(active)}
                onClick={() => {
                  if (tab.section) onPrimarySectionChange(tab.section);
                }}
              >
                <span className="relative inline-flex items-center gap-1">
                  {t(tab.labelKey)}
                  {showBadge ? (
                    <span
                      className="inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-sam-primary px-1 py-px text-[10px] font-bold leading-none text-white"
                      aria-hidden
                    >
                      {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </HorizontalDragScroll>
      </div>
    </div>
  );
}
