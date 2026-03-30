"use client";

import { useLayoutEffect } from "react";
import { ChatsPhilifeHubSecondaryTabs } from "@/components/chats/ChatsPhilifeHubSecondaryTabs";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

/** `/chats/philife` — 전역 1단 아래 커뮤니티 채팅 허브 탭 */
export function ChatsPhilifeHubMainTier1Sync() {
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      stickyBelow: (
        <>
          <div className="w-full min-w-0 shrink-0 border-b border-ig-border bg-[var(--sub-bg)]">
            <ChatHubTopTabs active="community" showOrderTab={false} />
          </div>
          <div className="w-full min-w-0 shrink-0 border-b border-ig-border bg-[var(--sub-bg)]">
            <ChatsPhilifeHubSecondaryTabs />
          </div>
        </>
      ),
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras]);

  return null;
}
