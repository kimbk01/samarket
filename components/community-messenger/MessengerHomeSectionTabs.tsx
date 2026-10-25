"use client";

import { UserPlus, UsersRound } from "lucide-react";
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
  /** §15-3: 네 탭 공통 [친구 추가] — 받은 요청 수 배지 · 친구 요청·추가 시트 */
  incomingFriendRequestCount: number;
  outgoingFriendRequestCount: number;
  onOpenFriendRequests: () => void;
};

const TAB_ROW_ICON_BTN =
  "relative inline-flex h-[length:var(--dibay-secondary-tab-item-h,36px)] w-[length:var(--dibay-secondary-tab-item-h,36px)] shrink-0 items-center justify-center rounded-ui-rect border border-[color:var(--dibay-domain-divider,var(--sam-border))] bg-[color:var(--dibay-domain-tab-idle-bg,var(--sam-surface))] text-[color:var(--dibay-domain-tab-idle-fg,var(--sam-fg))] transition active:scale-[0.98]";

/**
 * Messenger home section tabs — Community / Trade 와 동일 DibaySecondaryTabRow SSOT.
 * §15-3: 오른쪽 [친구 추가]는 친구·통화·대화·보관함 네 탭 모두 같은 자리·모양·동작.
 * 그룹 만들기는 대화 탭에서만, 다른 아이콘(사람 여럿)으로 [친구 추가] 왼쪽에.
 */
export function MessengerHomeSectionTabs({
  mainSection,
  onPrimarySectionChange,
  onOpenGroupCreate,
  incomingFriendRequestCount,
  outgoingFriendRequestCount,
  onOpenFriendRequests,
}: Props) {
  const { t } = useI18n();
  const requestBadge = incomingFriendRequestCount > 99 ? "99+" : String(incomingFriendRequestCount);

  return (
    <DibaySecondaryTabRow
      data-cm-primary-nav
      data-cm-messenger-section-tabs
      bordered
      trackAriaLabel={t("cm_ui_messenger_section_aria")}
      trailing={
        <div className="flex shrink-0 items-center gap-2" data-cm-section-tab-actions="">
          {mainSection === "chats" ? (
            <button
              type="button"
              onClick={onOpenGroupCreate}
              className={TAB_ROW_ICON_BTN}
              aria-label={t("cm_ui_create_group")}
              title={t("cm_ui_create_group")}
              data-cm-group-create-button=""
            >
              <UsersRound
                className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
                strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
                aria-hidden
              />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenFriendRequests}
            className={TAB_ROW_ICON_BTN}
            aria-label={t("cm_friend_requests_button_aria", {
              received: incomingFriendRequestCount,
              sent: outgoingFriendRequestCount,
            })}
            data-cm-friend-requests-button=""
          >
            <UserPlus
              className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
              strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
              aria-hidden
            />
            {incomingFriendRequestCount > 0 ? (
              <span
                className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[color:var(--sm-color-danger)] px-1 text-[11px] font-bold leading-none text-white ring-2 ring-[color:var(--messenger-bg,#fff)]"
                aria-hidden
              >
                {requestBadge}
              </span>
            ) : null}
          </button>
        </div>
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
