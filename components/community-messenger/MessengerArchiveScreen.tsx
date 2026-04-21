"use client";

import type { ComponentProps } from "react";
import type { MessengerArchiveSection, MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import { MessengerChatsScreen } from "@/components/community-messenger/MessengerChatsScreen";

type ChatsProps = ComponentProps<typeof MessengerChatsScreen>;

type Props = Omit<ChatsProps, "showFilters" | "emptyMessage" | "listContext"> & {
  emptyMessage?: string;
  listContext?: MessengerChatListContext;
  selectedArchiveSection?: MessengerArchiveSection | null;
  incomingRequestCount?: number;
  onSelectArchiveSection?: (section: MessengerArchiveSection | null) => void;
};

/** 보관함 탭 — 필터 없이 보관된 대화만 표시 */
export function MessengerArchiveScreen({
  items,
  emptyMessage = "보관한 대화 없음",
  listContext = "archive",
  selectedArchiveSection = null,
  incomingRequestCount = 0,
  onSelectArchiveSection,
  ...rest
}: Props) {
  const filteredItems =
    selectedArchiveSection === "muted_chats" ? items.filter((item) => item.room.isMuted) : items;
  const resolvedEmptyMessage =
    selectedArchiveSection === "muted_chats" ? "알림을 끈 대화가 없습니다." : emptyMessage;

  return (
    <section className="space-y-2 pt-0">
      <div className="border-b border-[color:var(--messenger-divider)] px-1 py-2">
        <p className="text-[15px] font-bold leading-tight" style={{ color: "var(--messenger-text)" }}>
          보관함
        </p>
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          숨김·차단·알림 끔·보관을 구분해 관리합니다. 행을 밀면 복원할 수 있습니다.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ArchiveSectionCard
          title="숨김 친구"
          active={selectedArchiveSection === "hidden_friends"}
          onClick={() => onSelectArchiveSection?.("hidden_friends")}
        />
        <ArchiveSectionCard
          title="차단 친구"
          active={selectedArchiveSection === "blocked_friends"}
          onClick={() => onSelectArchiveSection?.("blocked_friends")}
        />
        <ArchiveSectionCard
          title="알림 끔"
          active={selectedArchiveSection === "muted_chats"}
          onClick={() => onSelectArchiveSection?.("muted_chats")}
        />
        <ArchiveSectionCard
          title="보관 채팅"
          active={selectedArchiveSection === "archived_chats" || selectedArchiveSection === null}
          onClick={() => onSelectArchiveSection?.("archived_chats")}
        />
        <ArchiveSectionCard
          title={`요청함${incomingRequestCount > 0 ? ` · ${incomingRequestCount}` : ""}`}
          active={selectedArchiveSection === "requests"}
          onClick={() => onSelectArchiveSection?.("requests")}
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
      <p className="text-[13px] font-semibold" style={{ color: "var(--messenger-text)" }}>
        {title}
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
        상세 관리로 이동
      </p>
    </button>
  );
}
