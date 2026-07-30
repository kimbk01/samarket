"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";
import type { MessengerArchiveSection } from "@/lib/community-messenger/messenger-ia";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

type ChatsProps = Omit<
  ComponentProps<typeof MessengerChatsScreen>,
  "items" | "showFilters" | "emptyMessage" | "listContext"
>;

type Props = {
  section: MessengerArchiveSection;
  archivedItems: UnifiedRoomListItem[];
  mutedItems: UnifiedRoomListItem[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onToggleHiddenFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  chatsProps: ChatsProps;
  /** 시트/우측 패널 상단 제목 표시 */
  showTitle?: boolean;
};

export function archiveSectionTitleKey(
  section: MessengerArchiveSection
): "cm_ui_hidden_friends" | "cm_ui_blocked_friends" | "cm_ui_notifications_off" | "cm_ui_archived_chats" | "nav_messenger_archive" {
  switch (section) {
    case "hidden_friends":
      return "cm_ui_hidden_friends";
    case "blocked_friends":
      return "cm_ui_blocked_friends";
    case "muted_chats":
      return "cm_ui_notifications_off";
    case "archived_chats":
      return "cm_ui_archived_chats";
    default:
      return "nav_messenger_archive";
  }
}

/**
 * 보관함 서브섹션 본문 — 모바일 시트 / 태블릿 우측 / list-only 인라인 공유.
 */
export function MessengerArchiveSectionPanel({
  section,
  archivedItems,
  mutedItems,
  friendStateModel,
  busyId,
  onToggleHiddenFriend,
  onToggleBlock,
  chatsProps,
  showTitle = true,
}: Props) {
  const { t } = useI18n();
  const title = t(archiveSectionTitleKey(section));

  if (section === "hidden_friends" || section === "blocked_friends") {
    const entries =
      section === "hidden_friends" ? friendStateModel.hidden : friendStateModel.blocked;
    const emptyLabel =
      section === "hidden_friends" ? t("cm_ui_no_hidden_friends") : t("cm_ui_no_blocked_users");
    const busyPrefix = section === "hidden_friends" ? "hidden" : "block";
    const onRelease = section === "hidden_friends" ? onToggleHiddenFriend : onToggleBlock;

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
        {showTitle ? (
          <div className="shrink-0 border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
            <p className="sam-text-body font-bold" style={{ color: "var(--messenger-text)" }}>
              {title}
            </p>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
          {entries.length ? (
            <div className="space-y-0">
              {entries.map((entry) => {
                const profile = entry.profile;
                return (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between gap-2 border-b border-[color:var(--messenger-divider)] py-2.5 last:border-0"
                  >
                    <div className="min-w-0">
                      <p
                        className="truncate sam-text-body-secondary font-medium"
                        style={{ color: "var(--messenger-text)" }}
                      >
                        {profile.label}
                      </p>
                      {profile.subtitle ? (
                        <p
                          className="truncate sam-text-xxs"
                          style={{ color: "var(--messenger-text-secondary)" }}
                        >
                          {profile.subtitle}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRelease(profile.id)}
                      disabled={busyId === `${busyPrefix}:${profile.id}`}
                      className="shrink-0 sam-text-xxs font-semibold text-sam-primary disabled:opacity-50"
                    >
                      {t("cm_ui_release")}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center sam-text-body-secondary" style={{ color: "var(--messenger-text-secondary)" }}>
              {emptyLabel}
            </p>
          )}
        </div>
      </div>
    );
  }

  const isMuted = section === "muted_chats";
  const chatItems = isMuted ? mutedItems : archivedItems;
  const emptyMessage = isMuted
    ? t("cm_ui_no_muted_conversations")
    : t("cm_ui_archived_conversations_empty");

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-cm-archive-section={section}>
      {showTitle ? (
        <div className="shrink-0 border-b border-[color:var(--messenger-divider)] px-3 py-2.5">
          <p className="sam-text-body font-bold" style={{ color: "var(--messenger-text)" }}>
            {title}
          </p>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <MessengerChatsScreen
          {...chatsProps}
          items={chatItems}
          emptyMessage={emptyMessage}
          showFilters={false}
          listContext="archive"
        />
      </div>
    </div>
  );
}
