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

const SECTION_PILL_LABEL_KEYS: Record<MessengerMainSection, MessageKey> = {
  friends: "cm_ia_messenger_tab_friends_list",
  call_logs: "cm_ia_messenger_tab_call_logs",
  chats: "cm_ia_messenger_tab_home",
  open_chat: "cm_ia_messenger_tab_meeting_room",
  archive: "cm_ia_messenger_tab_archive",
};

/**
 * 알약 탭 — 테두리·배경·호버가 동일한 rounded-full 틀 안에서만 변함.
 * 카운트 뱃지는 라벨 옆 pill 내부(inline)에 두어 clip·겹침 없이 유지한다.
 */
const SECTION_TAB_PILL_FRAME =
  "relative box-border inline-flex shrink-0 items-center justify-center gap-1 min-h-11 overflow-hidden whitespace-nowrap rounded-full border border-solid px-3.5 text-[12px] leading-none touch-manipulation transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sam-primary/25";

function sectionTabPillClass(active: boolean): string {
  if (active) {
    return `${SECTION_TAB_PILL_FRAME} border-sam-primary bg-sam-primary-soft font-bold text-sam-primary`;
  }
  return `${SECTION_TAB_PILL_FRAME} border-sam-border bg-sam-surface font-semibold text-sam-fg hover:border-sam-primary-border hover:bg-sam-primary-soft hover:text-sam-primary`;
}

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  onOpenGroupCreate: () => void;
};

/**
 * 메신저 홈 2단 섹션 탭 — 친구 · 통화 · 대화 · 보관함 (+ 우측 그룹 생성).
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
      className="sticky top-0 z-20 min-w-0 w-full overflow-x-hidden bg-[color:var(--messenger-bg)]"
    >
      <div className="box-border py-2 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]">
        <div className="flex min-w-0 items-center gap-2">
          <HorizontalDragScroll
            className="flex min-h-11 min-w-0 flex-1 items-center justify-start gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  className={sectionTabPillClass(active)}
                  onClick={() => onPrimarySectionChange(section)}
                >
                  <span className="min-w-0 max-w-[min(9rem,38vw)] truncate">
                    {t(SECTION_PILL_LABEL_KEYS[section])}
                  </span>
                </button>
              );
            })}
          </HorizontalDragScroll>
          <button
            type="button"
            onClick={onOpenGroupCreate}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-sam-border bg-sam-surface text-sam-fg transition active:scale-[0.98] hover:border-sam-primary-border hover:bg-sam-primary-soft hover:text-sam-primary"
            aria-label={t("cm_ui_create_group")}
          >
            <UserPlus2
              className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
              strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
              aria-hidden
            />
          </button>
        </div>
      </div>
    </div>
  );
}
