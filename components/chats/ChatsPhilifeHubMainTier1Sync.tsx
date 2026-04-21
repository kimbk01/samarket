"use client";

import { useLayoutEffect } from "react";
import { ChatHubTopTabs } from "@/components/order-chat/ChatHubTopTabs";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";

/** 제거된 커뮤니티 허브 자리도 거래/주문 탭만 유지 */
export function ChatsPhilifeHubMainTier1Sync() {
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      stickyBelow: (
        <div className="w-full min-w-0 shrink-0 border-b border-sam-border bg-[var(--sub-bg)]">
          <ChatHubTopTabs active="trade" />
        </div>
      ),
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras]);

  return null;
}
