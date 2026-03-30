"use client";

import { useSearchParams } from "next/navigation";
import { ChatHubSecondaryTabs } from "@/components/chats/ChatHubSecondaryTabs";
import { COMMUNITY_CHAT_SURFACE } from "@/lib/chats/surfaces/community-chat-surface";

/** `/chats/philife` — 1:1 / 오픈채팅 2탭 (쿼리 `tab=`) */
export function ChatsPhilifeHubSecondaryTabs() {
  const tab = useSearchParams().get("tab") === "open" ? "open" : "inbox";

  return (
    <ChatHubSecondaryTabs
      items={[
        {
          href: COMMUNITY_CHAT_SURFACE.inboxPath,
          label: COMMUNITY_CHAT_SURFACE.inboxTabLabel,
          active: tab === "inbox",
          scroll: false,
        },
        {
          href: COMMUNITY_CHAT_SURFACE.openPath,
          label: COMMUNITY_CHAT_SURFACE.openTabLabel,
          active: tab === "open",
          scroll: false,
        },
      ]}
    />
  );
}
