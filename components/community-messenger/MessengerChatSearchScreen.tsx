"use client";

import { useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { DibaySecondaryTabRow } from "@/components/ui/DibaySecondaryTabRow";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useBottomNavOccupiesClearance } from "@/lib/layout/bottom-nav-scroll-chrome-context";
import { DIBAY_SECONDARY_TAB_LABEL_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";
import { formatChatListKakaoTime } from "@/lib/community-messenger/chat-list/chat-list-kakao-time";
import {
  MESSENGER_CHAT_SEARCH_TABS,
  messengerChatSearchSections,
  type MessengerChatSearchSection,
  type MessengerChatSearchTab,
} from "@/lib/community-messenger/messenger-chat-search-model";
import type {
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

type Props = {
  keyword: string;
  onKeywordChange: (next: string) => void;
  recentSearches: string[];
  onCommitRecentSearch: (value: string) => void;
  onRemoveRecentSearch: (value: string) => void;
  onClearRecentSearches: () => void;
  searchFriendMatches: CommunityMessengerProfileLite[];
  searchRoomMatches: UnifiedRoomListItem[];
  searchMessageMatches: UnifiedRoomListItem[];
  searchOpenChatMatches: CommunityMessengerDiscoverableGroupSummary[];
  viewerUserId: string | null;
  favoriteFriendIds: Set<string>;
  savedFriendIds?: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onSelectFriend: (friend: CommunityMessengerProfileLite) => void;
  onSelectOpenGroup: (groupId: string) => void;
  onSelectMessageRoom: (roomId: string) => void;
};

/**
 * 채팅 검색 (채팅 시안 4판 「8. 채팅 검색」, Owner 「정확히 시안대로」 2026-11-10) — 머리글 돋보기로 여는 채팅 안 검색(앱 전체 검색 아님).
 * 머리글은 공통 하위 화면 머리글(뒤로 + 가운데 「채팅 검색」) — 시안의 머리글 안 입력칸 대신 머리글 바로 아래 찾기 칸 38(Owner 머리글 규정).
 * 탭 전체·대화·친구·메시지(메신저 탭 줄과 같은 모양) · 검색어가 없으면 최근 검색(「전체 삭제」·줄마다 ✕).
 */
export function MessengerChatSearchScreen(props: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<MessengerChatSearchTab>("all");
  const bottomNavOccupiesClearance = useBottomNavOccupiesClearance();
  const queryActive = props.keyword.trim().length > 0;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-cm-chat-search-screen="">
      <div className="shrink-0">
        <label className="relative mx-4 my-2 flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-5 w-5"
            style={{ color: "var(--cm-chat-sub)" }}
            strokeWidth={1.7}
            aria-hidden
          />
          <input
            value={props.keyword}
            onChange={(e) => props.onKeywordChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                props.onCommitRecentSearch(props.keyword);
              }
            }}
            type="search"
            enterKeyHint="search"
            placeholder={t("cm_chat_search_placeholder")}
            aria-label={t("cm_chat_search_placeholder")}
            className="h-[38px] w-full border-0 bg-[color:var(--cm-chat-band)] text-[16px] outline-none placeholder:text-[15px] placeholder:text-[color:var(--cm-chat-sub)] focus:ring-1 focus:ring-[color:var(--messenger-primary)] [&::-webkit-search-cancel-button]:hidden"
            data-cm-messenger-search-input=""
            style={{ color: "var(--cm-chat-fg)" }}
          />
          {props.keyword ? (
            <button
              type="button"
              onClick={() => props.onKeywordChange("")}
              aria-label={t("cm_pick_search_clear")}
              className="absolute right-1 flex h-9 w-9 items-center justify-center rounded-full"
              style={{ color: "var(--cm-chat-sub)" }}
            >
              <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          ) : null}
        </label>
        <DibaySecondaryTabRow
          data-cm-messenger-search-tabs
          data-dibay-tab-align="start"
          bordered
          trackAriaLabel={t("cm_chat_search_tabs_aria")}
        >
          {MESSENGER_CHAT_SEARCH_TABS.map(({ tab: value, labelKey }) => {
            const active = tab === value;
            return (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active ? "true" : "false"}
                data-cm-chat-search-tab={value}
                className={dibaySecondaryTabClass(active)}
                onClick={() => setTab(value)}
              >
                <span className={DIBAY_SECONDARY_TAB_LABEL_CLASS}>{t(labelKey)}</span>
              </button>
            );
          })}
        </DibaySecondaryTabRow>
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          bottomNavOccupiesClearance ? "pb-[var(--app-bottom-nav-clearance)]" : "pb-[var(--safe-bottom)]"
        }`}
        data-cm-chat-search-results={queryActive ? tab : "recent"}
      >
        {queryActive ? <SearchResults {...props} tab={tab} /> : <RecentSearches {...props} />}
      </div>
    </section>
  );
}

function RecentSearches({ recentSearches, onKeywordChange, onRemoveRecentSearch, onClearRecentSearches }: Props) {
  const { t } = useI18n();
  return (
    <div data-cm-chat-search-recent="">
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3.5 text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
        <h2 className="font-normal">{t("cm_ui_recent_searches")}</h2>
        {recentSearches.length ? (
          <button type="button" onClick={onClearRecentSearches} data-cm-chat-search-clear-all="">
            {t("cm_chat_search_clear_all")}
          </button>
        ) : null}
      </div>
      {recentSearches.length ? (
        <ul role="list">
          {recentSearches.map((term) => (
            <li key={term} className="flex h-[54px] items-center">
              <button
                type="button"
                onClick={() => onKeywordChange(term)}
                className="flex h-full min-w-0 flex-1 items-center truncate pl-4 text-left text-[15px] active:bg-[color:var(--cm-chat-band)]"
                style={{ color: "var(--cm-chat-fg)" }}
              >
                <span className="truncate">{term}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemoveRecentSearch(term)}
                aria-label={t("cm_chat_search_remove_recent_aria", { term })}
                className="flex h-full w-12 shrink-0 items-center justify-center"
                style={{ color: "var(--cm-chat-sub)" }}
                data-cm-chat-search-remove=""
              >
                <X className="h-4 w-4" strokeWidth={1.9} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
          {t("cm_ui_no_recent_searches")}
        </p>
      )}
    </div>
  );
}

function SearchResults(props: Props & { tab: MessengerChatSearchTab }) {
  const { t } = useI18n();
  const sections = messengerChatSearchSections(props.tab);
  const showTitles = sections.length > 1;
  const commit = () => props.onCommitRecentSearch(props.keyword);
  const render: Record<MessengerChatSearchSection, () => ReactNode> = {
    rooms: () => (
      <ResultSection key="rooms" section="rooms" title={showTitles ? t("cm_chat_search_tab_rooms") : null}>
        {props.searchRoomMatches.length ? (
          <div onClickCapture={commit}>
            {props.searchRoomMatches.map((item) => (
              <MessengerChatListItem
                key={`search-room-${item.room.id}`}
                item={item}
                viewerUserId={props.viewerUserId}
                favoriteFriendIds={props.favoriteFriendIds}
                savedFriendIds={props.savedFriendIds}
                busyId={props.busyId}
                onTogglePin={props.onTogglePin}
                onToggleMute={props.onToggleMute}
                onMarkRead={props.onMarkRead}
                onToggleArchive={props.onToggleArchive}
                listVisual="default"
              />
            ))}
          </div>
        ) : (
          <Empty>{t("cm_ui_no_matching_chat_rooms")}</Empty>
        )}
      </ResultSection>
    ),
    friends: () => (
      <ResultSection key="friends" section="friends" title={showTitles ? t("cm_chat_search_tab_friends") : null}>
        {props.searchFriendMatches.length ? (
          <ul role="list">
            {props.searchFriendMatches.map((friend) => (
              <li key={`search-friend-${friend.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    commit();
                    props.onSelectFriend(friend);
                  }}
                  className="flex h-16 w-full items-center gap-3 px-4 text-left active:bg-[color:var(--cm-chat-band)]"
                >
                  <SamarketUserAvatarThumb avatarUrl={friend.avatarUrl} size={44} roundedClassName="rounded-[16px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                      {friend.label}
                    </span>
                    {friend.subtitle ? (
                      <span className="block truncate text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
                        {friend.subtitle}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t("cm_ui_no_matching_friends")}</Empty>
        )}
      </ResultSection>
    ),
    messages: () => (
      <ResultSection key="messages" section="messages" title={showTitles ? t("cm_chat_search_tab_messages") : null}>
        {props.searchMessageMatches.length ? (
          <ul role="list">
            {props.searchMessageMatches.map((item) => (
              <li key={`search-message-${item.room.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    commit();
                    props.onSelectMessageRoom(item.room.id);
                  }}
                  className="flex h-[72px] w-full items-center gap-3 px-4 text-left active:bg-[color:var(--cm-chat-band)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                      {item.room.title}
                    </span>
                    <span className="mt-[3px] block truncate text-[13.5px] leading-[1.35]" style={{ color: "var(--cm-chat-sub)" }}>
                      {item.preview}
                    </span>
                  </span>
                  <span className="shrink-0 self-start pt-4 text-[11.5px] tabular-nums" style={{ color: "var(--cm-chat-sub)" }}>
                    {formatChatListKakaoTime(item.lastEventAt, t)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t("cm_ui_no_matching_messages")}</Empty>
        )}
      </ResultSection>
    ),
    meetings: () =>
      props.searchOpenChatMatches.length ? (
        <ResultSection key="meetings" section="meetings" title={t("nav_messenger_open_group")}>
          <ul role="list">
            {props.searchOpenChatMatches.map((group) => (
              <li key={`search-open-${group.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    commit();
                    props.onSelectOpenGroup(group.id);
                  }}
                  className="flex h-16 w-full items-center gap-3 px-4 text-left active:bg-[color:var(--cm-chat-band)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold leading-[1.3]" style={{ color: "var(--cm-chat-fg)" }}>
                      {group.title}
                    </span>
                    <span className="block truncate text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
                      {group.summary || t("nav_chat_count_people", { count: group.memberCount })}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ResultSection>
      ) : null,
  };
  return <div data-cm-chat-search-sections={sections.join(",")}>{sections.map((s) => render[s]())}</div>;
}

function ResultSection({
  section,
  title,
  children,
}: {
  section: MessengerChatSearchSection;
  title: string | null;
  children: ReactNode;
}) {
  return (
    <div data-cm-chat-search-section={section}>
      {title ? (
        <h2 className="px-4 pb-1.5 pt-3.5 text-[12.5px] font-normal leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
          {title}
        </h2>
      ) : null}
      {children}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="px-4 py-3 text-[14px]" style={{ color: "var(--cm-chat-sub)" }}>
      {children}
    </p>
  );
}
