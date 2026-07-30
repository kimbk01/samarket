"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import {
  MessengerArchiveSectionPanel,
  archiveSectionTitleKey,
} from "@/components/community-messenger/MessengerArchiveSectionPanel";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
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
  selectedArchiveSection?: MessengerArchiveSection | null;
  onSelectArchiveSection?: (section: MessengerArchiveSection | null) => void;
  /**
   * hub MasterDetail 이 우측 detail 을 담당하면 true — 와이드에서 인라인/시트 생략.
   * list-only 는 false → 와이드에서도 카드 아래 인라인 패널.
   */
  detailExternal?: boolean;
};

/** 보관함 탭 — 카드 그리드 + 모바일 시트 / 태블릿 우측(또는 인라인) 상세 */
export function MessengerArchiveScreen({
  items,
  mutedItems,
  friendStateModel,
  busyId,
  onToggleHiddenFriend,
  onToggleBlock,
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

  return (
    <section className="space-y-2 pt-0" data-cm-archive-screen="">
      <div className="border-b border-[color:var(--messenger-divider)] px-1 py-2">
        <p className="sam-text-body font-bold leading-tight" style={{ color: "var(--messenger-text)" }}>
          {t("nav_messenger_archive")}
        </p>
        <p className="mt-0.5 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          {t("cm_ui_manage_hidden_blocked_muted_archived")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ArchiveSectionCard
          title={t("cm_ui_hidden_friends")}
          active={selectedArchiveSection === "hidden_friends"}
          onClick={() => onSelectArchiveSection?.("hidden_friends")}
        />
        <ArchiveSectionCard
          title={t("cm_ui_blocked_friends")}
          active={selectedArchiveSection === "blocked_friends"}
          onClick={() => onSelectArchiveSection?.("blocked_friends")}
        />
        <ArchiveSectionCard
          title={t("cm_ui_notifications_off")}
          active={selectedArchiveSection === "muted_chats"}
          onClick={() => onSelectArchiveSection?.("muted_chats")}
        />
        <ArchiveSectionCard
          title={t("cm_ui_archived_chats")}
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
          panelClassName="flex min-h-0 flex-col overflow-hidden"
        >
          <MessengerArchiveSectionPanel
            section={selectedArchiveSection}
            archivedItems={items}
            mutedItems={mutedItems}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onToggleHiddenFriend={onToggleHiddenFriend}
            onToggleBlock={onToggleBlock}
            chatsProps={chatsPanelProps}
            showTitle
          />
        </MessengerHomeBottomSheetShell>
      ) : null}
    </section>
  );
}

function ArchiveSectionCard({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[10px] border px-2.5 py-2.5 text-left transition ${
        active
          ? "border-sam-primary bg-sam-primary-soft"
          : "border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]"
      }`}
    >
      <p className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text)" }}>
        {title}
      </p>
      <p className="mt-1 sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
        {t("cm_ui_go_to_detail_management")}
      </p>
    </button>
  );
}
