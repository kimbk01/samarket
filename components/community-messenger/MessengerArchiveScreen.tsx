"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerArchiveSection, MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";

type ChatsProps = ComponentProps<typeof MessengerChatsScreen>;

type Props = Omit<ChatsProps, "showFilters" | "emptyMessage" | "listContext"> & {
  emptyMessage?: string;
  listContext?: MessengerChatListContext;
  selectedArchiveSection?: MessengerArchiveSection | null;
  onSelectArchiveSection?: (section: MessengerArchiveSection | null) => void;
};

/** 보관함 탭 — 필터 없이 보관된 대화만 표시 */
export function MessengerArchiveScreen({
  items,
  emptyMessage,
  listContext = "archive",
  selectedArchiveSection = null,
  onSelectArchiveSection,
  ...rest
}: Props) {
  const { t } = useI18n();
  const filteredItems =
    selectedArchiveSection === "muted_chats" ? items.filter((item) => item.room.isMuted) : items;
  const resolvedEmptyMessage =
    selectedArchiveSection === "muted_chats"
      ? t("cm_ui_no_muted_conversations")
      : (emptyMessage ?? t("cm_ui_archived_conversations_empty"));

  return (
    <section className="space-y-2 pt-0">
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
          active={selectedArchiveSection === "archived_chats" || selectedArchiveSection === null}
          onClick={() => onSelectArchiveSection?.("archived_chats")}
        />
      </div>
      <MessengerChatsScreen
        {...rest}
        items={filteredItems}
        emptyMessage={resolvedEmptyMessage}
        showFilters={false}
        listContext={listContext}
      />
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
      className={`rounded-[10px] border px-2.5 py-2.5 text-left ${
        active
          ? "border-[color:var(--messenger-primary)] bg-[color:var(--messenger-primary-soft)]"
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
