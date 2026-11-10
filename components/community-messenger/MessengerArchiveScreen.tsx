"use client";

import { useEffect, type ComponentProps, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Archive, Ban, BellOff, ChevronRight, EyeOff, UserX } from "lucide-react";
import { useMessengerRejectedRequests } from "@/components/community-messenger/MessengerRejectedRequestsList";
import type { MessengerPrivacyListsStatus } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerArchiveSectionPanel } from "@/components/community-messenger/MessengerArchiveSectionPanel";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
import {
  MESSENGER_ARCHIVE_FROM_QUERY_KEY,
  messengerArchiveGroupOrder,
  messengerArchiveSectionTitleKey,
  parseMessengerArchiveEntry,
  type MessengerArchiveGroup,
} from "@/lib/community-messenger/messenger-archive-route";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";

type ChatsProps = Omit<
  ComponentProps<typeof MessengerChatsScreen>,
  "items" | "showFilters" | "emptyMessage" | "listContext"
>;

type Props = ChatsProps & {
  /** 보관된 대화 목록 */
  items: UnifiedRoomListItem[];
  /** 알림 끔(뮤트) 대화 — 보관 여부와 무관 */
  mutedItems: UnifiedRoomListItem[];
  friendStateModel: MessengerFriendStateModel;
  onToggleHiddenFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  privacyListsStatus: MessengerPrivacyListsStatus;
  onRetryPrivacyLists: () => void;
  selectedArchiveSection?: MessengerArchiveSection | null;
  onSelectArchiveSection?: (section: MessengerArchiveSection | null) => void;
  /**
   * hub MasterDetail 이 우측 detail 을 담당하면 true — 와이드에서 인라인 생략.
   * list-only 는 false → 와이드에서도 목록 아래 인라인 패널.
   */
  detailExternal?: boolean;
};

const ICON_CLASS = "h-5 w-5";
const ICON_STROKE = 1.7;

/**
 * 보관함 (채팅 시안 4판 「4. 보관함」, Owner 「정확히 시안대로」 2026-11-10).
 * - 첫 화면: 「채팅」(보관한 채팅 · 알림 끈 대화) · 「친구」(숨긴 친구 · 차단한 친구 · 거절한 요청) 묶음.
 *   친구 탭 「관리」·설정 「친구 관리」로 오면(`archiveFrom=friends`) 「친구」 묶음 먼저.
 * - 휴대폰: 줄을 누르면 항목 상세가 하위 화면으로 열린다(주소 `&archive=`, 1단 머리글 = 항목 이름 + 뒤로 = 보관함).
 * - 분할 화면(≥768): 오른쪽(또는 아래) 상세 — 예전과 같다.
 * 머리글(뒤로 + 「보관함」)은 1단 공통 하위 화면 머리글이 그린다 (`resolve-main-tier1`).
 */
export function MessengerArchiveScreen({
  items,
  mutedItems,
  friendStateModel,
  busyId,
  onToggleHiddenFriend,
  onToggleBlock,
  privacyListsStatus,
  onRetryPrivacyLists,
  selectedArchiveSection = null,
  onSelectArchiveSection,
  detailExternal = false,
  ...chatsProps
}: Props) {
  const { t } = useI18n();
  const isWide = useIsMessengerSplitViewport();
  const searchParams = useSearchParams();
  const entry = parseMessengerArchiveEntry(searchParams?.get(MESSENGER_ARCHIVE_FROM_QUERY_KEY));
  const sectionOpen = selectedArchiveSection != null;
  const showMobileDetail = !isWide && sectionOpen;
  const showInlinePanel = isWide && !detailExternal && sectionOpen;

  const chatsPanelProps: ChatsProps = { ...chatsProps, busyId };
  /** §14-5: 거절한 요청 개수 — 보관함 첫 화면이 보일 때마다 다시 센다(상세에서 해제하고 돌아오면 반영) */
  const rejected = useMessengerRejectedRequests(false);
  const rejectedReload = rejected.reload;
  useEffect(() => {
    if (showMobileDetail) return;
    void rejectedReload();
  }, [rejectedReload, showMobileDetail]);
  /** 숨김·차단 목록을 아직 못 불러왔으면 0 대신 미확정(null) — "없음" 으로 오해하지 않게. */
  const privacyCount = (n: number): number | null =>
    n === 0 && privacyListsStatus !== "ready" ? null : n;

  const panel = (section: MessengerArchiveSection, showTitle: boolean) => (
    <MessengerArchiveSectionPanel
      section={section}
      archivedItems={items}
      mutedItems={mutedItems}
      friendStateModel={friendStateModel}
      busyId={busyId}
      onToggleHiddenFriend={onToggleHiddenFriend}
      onToggleBlock={onToggleBlock}
      privacyListsStatus={privacyListsStatus}
      onRetryPrivacyLists={onRetryPrivacyLists}
      chatsProps={chatsPanelProps}
      showTitle={showTitle}
      onRejectedRequestReleased={() => void rejectedReload()}
    />
  );

  if (showMobileDetail && selectedArchiveSection) {
    return (
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-cm-archive-screen=""
        data-cm-archive-detail={selectedArchiveSection}
      >
        {panel(selectedArchiveSection, false)}
      </section>
    );
  }

  const row = (section: MessengerArchiveSection, icon: ReactNode, count: number | null) => (
    <ArchiveSectionRow
      key={section}
      section={section}
      icon={icon}
      title={t(messengerArchiveSectionTitleKey(section))}
      count={count}
      active={selectedArchiveSection === section}
      onClick={() => onSelectArchiveSection?.(section)}
    />
  );

  const groups: Record<
    MessengerArchiveGroup,
    { labelKey: "cm_archive_group_chats" | "cm_archive_group_friends"; rows: ReactNode[] }
  > = {
    chats: {
      labelKey: "cm_archive_group_chats",
      rows: [
        row("archived_chats", <Archive className={ICON_CLASS} strokeWidth={ICON_STROKE} />, items.length),
        row("muted_chats", <BellOff className={ICON_CLASS} strokeWidth={ICON_STROKE} />, mutedItems.length),
      ],
    },
    friends: {
      labelKey: "cm_archive_group_friends",
      rows: [
        row(
          "hidden_friends",
          <EyeOff className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
          privacyCount(friendStateModel.hidden.length)
        ),
        row(
          "blocked_friends",
          <Ban className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
          privacyCount(friendStateModel.blocked.length)
        ),
        row(
          "requests",
          <UserX className={ICON_CLASS} strokeWidth={ICON_STROKE} />,
          rejected.requests == null ? null : rejected.requests.length
        ),
      ],
    },
  };

  return (
    <section className="pt-0" data-cm-archive-screen="" data-cm-archive-entry={entry}>
      {messengerArchiveGroupOrder(entry).map((group) => (
        <div key={group} role="list" aria-label={t(groups[group].labelKey)} data-cm-archive-group={group}>
          <p className="px-4 pb-1.5 pt-3.5 text-[12.5px] leading-[1.3]" style={{ color: "var(--cm-chat-sub)" }}>
            {t(groups[group].labelKey)}
          </p>
          {groups[group].rows}
        </div>
      ))}

      {showInlinePanel && selectedArchiveSection ? (
        <div className="mx-3 mt-2 min-h-[40vh] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
          {panel(selectedArchiveSection, true)}
        </div>
      ) : null}
    </section>
  );
}

/** 보관함 줄 — 높이 54 · 아이콘 칸 36(둥글기 12, 연회색) · 이름 16 · 오른쪽 회색 개수 + › */
function ArchiveSectionRow({
  section,
  icon,
  title,
  count,
  active,
  onClick,
}: {
  section: MessengerArchiveSection;
  icon: ReactNode;
  title: string;
  /** null = 아직 모름(불러오는 중) */
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="listitem"
      onClick={onClick}
      aria-current={active || undefined}
      data-cm-archive-row={section}
      className={`flex h-[54px] w-full items-center gap-3 px-4 text-left transition-colors active:bg-[color:var(--messenger-surface-muted)] ${
        active ? "bg-[color:var(--messenger-primary-soft)]" : ""
      }`}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[color:var(--cm-chat-band)]"
        style={{ color: "var(--cm-chat-fg)" }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[16px]" style={{ color: "var(--cm-chat-fg)" }}>
        {title}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[14px] tabular-nums" style={{ color: "var(--cm-chat-sub)" }}>
        {count == null ? "…" : count}
        <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
      </span>
    </button>
  );
}
