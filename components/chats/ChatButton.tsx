"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import { prepareTradeChatRoom } from "@/lib/chat/createOrGetChatRoom";
import {
  TRADE_CHAT_SURFACE,
  tradeHubChatComposeHref,
  tradeHubChatRoomHref,
} from "@/lib/chats/surfaces/trade-chat-surface";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import { startTradeChatEntryMark } from "@/lib/chats/trade-chat-entry-client";
import type { ChatRoomSource } from "@/lib/types/chat";

interface ChatButtonProps {
  productId: string;
  /** 당근형: 있으면 "대화중인 채팅" 표시, 클릭 시 해당 방으로 이동 */
  existingRoomId?: string | null;
  existingRoomSource?: ChatRoomSource | null;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 당근형: 채팅하기 / 대화중인 채팅
 * - existingRoomId 없음 → compose로 이동 후 방 확정 (`TradeChatComposeClient`)
 * - existingRoomId 있음 → "대화중인 채팅", 해당 방으로 이동
 */
export function ChatButton({
  productId,
  existingRoomId,
  existingRoomSource,
  disabled,
  className,
  children,
}: ChatButtonProps) {
  const { t, tt } = useI18n();
  const router = useRouter();
  const [error, setError] = useState("");

  const hasExisting = !!existingRoomId;
  const label = hasExisting
    ? t("common_existing_chat")
    : typeof children === "string"
      ? tt(children)
      : children ?? tt("채팅하기");

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) return;
    void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);
    if (existingRoomId) {
      void router.prefetch(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
    }
  }, [existingRoomId, existingRoomSource, router]);

  const handleClick = () => {
    setError("");
    const user = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, user)) return;
    if (hasExisting) {
      startTradeChatEntryMark({
        mode: "existing",
        productId,
        roomId: existingRoomId,
        sourceHint: existingRoomSource,
      });
      warmChatRoomEntryById(existingRoomId, existingRoomSource);
      router.push(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
      return;
    }
    startTradeChatEntryMark({
      mode: "create",
      productId,
    });
    const composeHref = tradeHubChatComposeHref({ productId });
    void router.prefetch(composeHref);
    router.push(composeHref);
  };

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={handleClick}
        onPointerEnter={() => {
          void router.prefetch(TRADE_CHAT_SURFACE.messengerListHref);
          if (existingRoomId) {
            void router.prefetch(tradeHubChatRoomHref(existingRoomId, existingRoomSource));
            warmChatRoomEntryById(existingRoomId, existingRoomSource);
          } else {
            void router.prefetch(tradeHubChatComposeHref({ productId }));
            prepareTradeChatRoom(productId);
          }
        }}
        disabled={disabled}
        className={className ?? "rounded-ui-rect bg-signature px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"}
      >
        {label}
      </button>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
