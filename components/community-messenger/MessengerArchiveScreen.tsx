"use client";

import type { ComponentProps, ReactNode } from "react";
import { Archive, Ban, BellOff, ChevronRight, EyeOff } from "lucide-react";
import type { MessengerPrivacyListsStatus } from "@/lib/community-messenger/home/use-community-messenger-home-bootstrap";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";
import {
  MessengerArchiveSectionPanel,
  archiveSectionTitleKey,
} from "@/components/community-messenger/MessengerArchiveSectionPanel";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS } from "@/lib/ui/messenger-split-pane-layout";

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
   * hub MasterDetail 이 우측 detail 을 담당하면 true — 와이드에서 인라인/시트 생략.
   * list-only 는 false → 와이드에서도 카드 아래 인라인 패널.
   */
  detailExternal?: boolean;
};

/** 보관함 탭 — 목록 행 + 모바일 시트 / 태블릿 우측(또는 인라인) 상세 */
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
  const sectionOpen = selectedArchiveSection != null;
  /** 모바일: 시트. 와이드+외부 detail: 카드만. 와이드+list-only: 인라인 */
  const showMobileSheet = !isWide && sectionOpen;
  const showInlinePanel = isWide && !detailExternal && sectionOpen;

  const chatsPanelProps: ChatsProps = { ...chatsProps, busyId };
  /** 숨김·차단 목록을 아직 못 불러왔으면 0 대신 미확정(null) — "없음" 으로 오해하지 않게. */
  const privacyCount = (n: number): number | null =>
    n === 0 && privacyListsStatus !== "ready" ? null : n;

  return (
    <section className="space-y-2 pt-0" data-cm-archive-screen="">
      {/* U-7 (1단계 문서 §13-4): 카드 4개 대신 다른 탭과 같은 목록 행 — 아이콘 · 이름 · 개수 · › */}
      <p className="px-3 pt-2 sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
        {t("cm_ui_manage_hidden_blocked_muted_archived")}
      </p>
      <div className="border-y border-[color:var(--messenger-divider)]" role="list">
        <ArchiveSectionRow
          icon={<EyeOff className="h-5 w-5" strokeWidth={2} />}
          title={t("cm_ui_hidden_friends")}
          count={privacyCount(friendStateModel.hidden.length)}
          active={selectedArchiveSection === "hidden_friends"}
          onClick={() => onSelectArchiveSection?.("hidden_friends")}
        />
        <ArchiveSectionRow
          icon={<Ban className="h-5 w-5" strokeWidth={2} />}
          title={t("cm_ui_blocked_friends")}
          count={privacyCount(friendStateModel.blocked.length)}
          active={selectedArchiveSection === "blocked_friends"}
          onClick={() => onSelectArchiveSection?.("blocked_friends")}
        />
        <ArchiveSectionRow
          icon={<BellOff className="h-5 w-5" strokeWidth={2} />}
          title={t("cm_ui_notifications_off")}
          count={mutedItems.length}
          active={selectedArchiveSection === "muted_chats"}
          onClick={() => onSelectArchiveSection?.("muted_chats")}
        />
        <ArchiveSectionRow
          icon={<Archive className="h-5 w-5" strokeWidth={2} />}
          title={t("cm_ui_archived_chats")}
          count={items.length}
          active={selectedArchiveSection === "archived_chats"}
          onClick={() => onSelectArchiveSection?.("archived_chats")}
        />
      </div>

      {showInlinePanel && selectedArchiveSection ? (
        <div className="min-h-[40vh] overflow-hidden rounded-[10px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
          <MessengerArchiveSectionPanel
            section={selectedArchiveSection}
            archivedItems={items}
            mutedItems={mutedItems}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onToggleHiddenFriend={onToggleHiddenFriend}
            onToggleBlock={onToggleBlock}
            privacyListsStatus={privacyListsStatus}
            onRetryPrivacyLists={onRetryPrivacyLists}
            chatsProps={chatsPanelProps}
            showTitle
          />
        </div>
      ) : null}

      {showMobileSheet && selectedArchiveSection ? (
        <MessengerHomeBottomSheetShell
          onClose={() => onSelectArchiveSection?.(null)}
          closeAriaLabel={t("nav_close")}
          dialogAriaLabel={t(archiveSectionTitleKey(selectedArchiveSection))}
          anchor="device-bottom"
          panelClassName={`flex min-h-0 flex-col overflow-hidden ${MESSENGER_HOME_SPLIT_LIST_SHEET_CLASS}`}
        >
          <MessengerSheetHeaderBar
            title={t(archiveSectionTitleKey(selectedArchiveSection))}
            onClose={() => onSelectArchiveSection?.(null)}
            closeLabel={t("nav_close")}
          />
          <MessengerArchiveSectionPanel
            section={selectedArchiveSection}
            archivedItems={items}
            mutedItems={mutedItems}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onToggleHiddenFriend={onToggleHiddenFriend}
            onToggleBlock={onToggleBlock}
            privacyListsStatus={privacyListsStatus}
            onRetryPrivacyLists={onRetryPrivacyLists}
            chatsProps={chatsPanelProps}
            showTitle={false}
          />
        </MessengerHomeBottomSheetShell>
      ) : null}
    </section>
  );
}

function ArchiveSectionRow({
  icon,
  title,
  count,
  active,
  onClick,
}: {
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
      className={`flex min-h-[56px] w-full items-center gap-3 border-b border-[color:var(--messenger-divider)] px-3 text-left transition-colors last:border-b-0 active:bg-[color:var(--messenger-surface-muted)] ${
        active ? "bg-[color:var(--messenger-primary-soft)]" : ""
      }`}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-rect bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
        {title}
      </span>
      <span className="shrink-0 tabular-nums sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
        {count == null ? "…" : count}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--messenger-text-secondary)]" strokeWidth={2} aria-hidden />
    </button>
  );
}
