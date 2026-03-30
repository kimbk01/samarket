"use client";

import { useSearchParams } from "next/navigation";
import { ChatRoomList } from "@/components/chats/ChatRoomList";

type PhilifeChatTab = "inbox" | "open";

function parsePhilifeChatTab(raw: string | null): PhilifeChatTab {
  return raw === "open" ? "open" : "inbox";
}

export function ChatsPhilifeHubClient() {
  const searchParams = useSearchParams();
  const activeTab = parsePhilifeChatTab(searchParams.get("tab"));
  const listSegment = activeTab === "open" ? "philife_open" : "philife_inbox";
  const from = activeTab === "open" ? "philife-open" : "philife-inbox";

  return (
    <div className="pb-24">
      <ChatRoomList
        segment={listSegment}
        getRoomHref={(roomId) => `/chats/${encodeURIComponent(roomId)}?from=${encodeURIComponent(from)}`}
      />
    </div>
  );
}
