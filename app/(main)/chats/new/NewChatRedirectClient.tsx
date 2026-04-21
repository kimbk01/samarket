"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { startTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";

export function NewChatRedirectClient({ productId }: { productId: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (!productId) {
      router.replace(TRADE_CHAT_SURFACE.messengerListHref);
      return;
    }
    startTradeChatEntryMark({ mode: "create", productId });
    router.replace(tradeHubChatComposeHref({ productId }));
  }, [productId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-center sam-text-body text-sam-muted">채팅방으로 이동 중...</p>
    </div>
  );
}
