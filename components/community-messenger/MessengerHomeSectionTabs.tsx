"use client";

import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";

type SectionTabId = "home" | "friends" | "call_logs" | "open_chat" | "archive";

type TabDef = {
  id: SectionTabId;
  section: MessengerMainSection;
  labelKey: MessageKey;
};

const TABS: TabDef[] = [
  { id: "home", section: "chats", labelKey: "cm_ia_messenger_tab_home" },
  { id: "friends", section: "friends", labelKey: "cm_ia_messenger_tab_friends_list" },
  { id: "call_logs", section: "call_logs", labelKey: "cm_ia_messenger_tab_call_logs" },
  { id: "open_chat", section: "open_chat", labelKey: "cm_ia_messenger_tab_meeting_room" },
  { id: "archive", section: "archive", labelKey: "cm_ia_messenger_tab_archive" },
];

/**
 * 알약 탭 — 테두리·배경·호버가 동일한 rounded-full 틀 안에서만 변함.
 * ring/shadow/outline 밖으로 번지는 효과는 쓰지 않는다.
 */
const SECTION_TAB_PILL_FRAME =
  "relative box-border inline-flex shrink-0 items-center justify-center min-h-11 overflow-hidden whitespace-nowrap rounded-full border border-solid px-3.5 text-[12px] leading-none touch-manipulation transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sam-primary/25";

function sectionTabPillClass(active: boolean): string {
  if (active) {
    return `${SECTION_TAB_PILL_FRAME} border-sam-primary bg-sam-primary-soft font-bold text-sam-primary`;
  }
  return `${SECTION_TAB_PILL_FRAME} border-sam-border bg-sam-surface font-semibold text-sam-fg hover:border-sam-primary-border hover:bg-sam-primary-soft hover:text-sam-primary`;
}

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  /** 보관함 탭 — pending 전체 */
  incomingRequestCount?: number;
  /** 친구목록 탭 — 받은 pending 만 */
  receivedFriendRequestCount?: number;
};

/**
 * 메신저 홈 2단 섹션 탭 — 홈·친구목록·통화목록·그룹방·보관함.
 * 친구 추가는 1단 헤더(검색 앞)로 이동.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  incomingRequestCount = 0,
  receivedFriendRequestCount = 0,
}: Props) {
  const { t } = useI18n();

  return (
    <div
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      className="sticky top-0 z-20 min-w-0 w-full overflow-x-hidden bg-[color:var(--messenger-bg)]"
    >
      <div className="box-border py-2 pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))]">
        <HorizontalDragScroll
          className="flex min-w-0 max-w-full items-center justify-start gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: "touch" }}
          role="tablist"
          aria-label={t("cm_ui_messenger_section_aria")}
        >
          {TABS.map((tab) => {
            const active = mainSection === tab.section;
            const badgeCount =
              tab.id === "friends"
                ? receivedFriendRequestCount
                : tab.id === "archive"
                  ? incomingRequestCount
                  : 0;
            const showBadge = badgeCount > 0;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                data-active={active ? "true" : "false"}
                className={sectionTabPillClass(active)}
                onClick={() => onPrimarySectionChange(tab.section)}
              >
                <span className="max-w-[min(10rem,42vw)] truncate">{t(tab.labelKey)}</span>
                {showBadge ? (
                  <span
                    className="pointer-events-none absolute -right-1 -top-1 z-[1] inline-flex h-4 min-w-4 items-center justify-center rounded-full border-[1.5px] border-sam-surface bg-[#e53935] px-0.5 text-[9px] font-bold leading-none text-white"
                    aria-hidden
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </HorizontalDragScroll>
      </div>
    </div>
  );
}
