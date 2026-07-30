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

const SECTION_TAB_LABEL_KEYS: Record<MessengerMainSection, MessageKey> = {
  friends: "cm_ia_messenger_tab_friends_list",
  call_logs: "cm_ia_messenger_tab_call_logs",
  chats: "cm_ia_messenger_tab_home",
  open_chat: "cm_ia_messenger_tab_meeting_room",
  archive: "cm_ia_messenger_tab_archive",
};

/**
 * 언더라인 탭 — 선택: 굵은 글씨 + 하단 라인(스타벅스/DIBAY `--sam-primary`).
 * 알약(rounded-full) 금지. 그룹 생성 버튼만 `rounded-ui-rect`.
 */
const SECTION_TAB_UNDERLINE_FRAME =
  "relative box-border inline-flex shrink-0 items-center justify-center gap-1 min-h-11 overflow-hidden whitespace-nowrap border-0 border-b-2 border-solid bg-transparent px-3 text-[13px] leading-none touch-manipulation transition-[color,border-color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sam-primary/25";

function sectionTabUnderlineClass(active: boolean): string {
  if (active) {
    return `${SECTION_TAB_UNDERLINE_FRAME} border-sam-primary font-bold text-sam-primary`;
  }
  return `${SECTION_TAB_UNDERLINE_FRAME} border-transparent font-medium text-sam-muted hover:text-sam-primary`;
}

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  onOpenGroupCreate: () => void;
};

/**
 * 메신저 홈 2단 섹션 탭 — 친구 · 통화 · 대화 · 보관함 (+ 대화 탭에서만 우측 그룹 생성).
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
      className="min-w-0 w-full overflow-x-hidden bg-[color:var(--messenger-bg)]"
    >
      <div className="box-border border-b border-sam-border/70 py-0 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]">
        <div className="flex min-w-0 items-center gap-1">
          <HorizontalDragScroll
            className="flex min-h-11 min-w-0 flex-1 items-center justify-start gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  className={sectionTabUnderlineClass(active)}
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
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface text-sam-fg transition active:scale-[0.98] hover:border-sam-primary-border hover:bg-sam-primary-soft hover:text-sam-primary"
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
    </div>
  );
}
