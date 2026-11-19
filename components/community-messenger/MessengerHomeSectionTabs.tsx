"use client";

import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
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
  /** 받은 친구 요청 수 — 「친구」 탭 이름 옆 숫자 */
  incomingFriendRequestCount: number;
};

/**
 * Messenger home section tabs — Community / Trade 와 동일 DibaySecondaryTabRow SSOT (왼쪽 정렬).
 * 2026-11-10 채팅 화면 시안 3판(Owner 「계획된 부분을 이어 가자」): 대화 · 친구 · 통화 3개, 탭 줄에는 버튼을 붙이지 않는다.
 * 그룹 만들기는 대화 탭 「새 대화」 버튼, 친구 추가는 친구 탭 맨 위 「친구 추가」 칸.
 * 2026-11-19 (Owner 「시안대로 정확히」, 시안 2): 밑줄 글자 → 흰 묶음 안 3칸 버튼(선택 = 초록 바탕 흰 글자).
 * 모양은 `app/dibay-chrome-ssot.css` 「telRING 2차 메뉴」 절. 숫자 배지 = 18px · 11px/700 · #E5484D, 글자와 6px.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  incomingFriendRequestCount,
}: Props) {
  const { t } = useI18n();
  const requestBadge = incomingFriendRequestCount > 99 ? "99+" : String(incomingFriendRequestCount);
  return (
    <DibaySecondaryTabRow
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      data-dibay-tab-align="start"
      bordered
      trackAriaLabel={t("cm_ui_messenger_section_aria")}
    >
      {MESSENGER_MAIN_SECTION_TAB_ORDER.map((section) => {
        const active = mainSection === section;
        const badge = section === "friends" && incomingFriendRequestCount > 0 ? requestBadge : null;
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
            {badge ? (
              <span
                className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E5484D] px-[5px] text-[11px] font-bold leading-none text-white"
                data-cm-section-tab-badge={section}
              >
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </DibaySecondaryTabRow>
  );
}
