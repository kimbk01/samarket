"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirect } from "@/lib/auth/client-access-flow";
import {
  openCreateTradeChat,
  openExistingTradeChat,
  prefetchTradeChatEntry,
} from "@/lib/chats/trade-chat-entry-navigation";
import type { ChatRoomSource } from "@/lib/types/chat";

interface ChatButtonProps {
  productId: string;
  /** 당근형: 있으면 "대화중인 채팅" 표시, 클릭 시 해당 방으로 이동 */
  existingRoomId?: string | null;
  existingRoomSource?: ChatRoomSource | null;
  /** 메신저 방 UUID — URL·prefetch 에만 사용, 부트스트랩은 `existingRoomId` */
  existingMessengerRoomId?: string | null;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 당근형: 채팅하기 / 대화중인 채팅
 * - existingRoomId 없음 → `openCreateTradeChat` 가 서버 resolve 후 메신저 방으로 바로 이동(실패 시에만 compose)
 * - existingRoomId 있음 → 해당 방으로 이동
 */
export function ChatButton({
  productId,
  existingRoomId,
  existingRoomSource,
  existingMessengerRoomId,
  disabled,
  className,
  children,
}: ChatButtonProps) {
  const { t, tt } = useI18n();
  const router = useRouter();

  const hasExisting = !!existingRoomId;
  const label = hasExisting
    ? t("common_existing_chat")
    : typeof children === "string"
      ? tt(children)
      : children ?? tt("채팅하기");

  useEffect(() => {
    const user = getCurrentUser();
    if (!user?.id) return;
    prefetchTradeChatEntry(router, {
      productId,
      existingRoomId,
      existingRoomSource,
      existingMessengerRoomId,
    });
  }, [existingRoomId, existingRoomSource, existingMessengerRoomId, productId, router]);

  const handleClick = () => {
    const user = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, user)) return;
    if (hasExisting) {
      openExistingTradeChat(router, {
        productId,
        roomId: existingRoomId,
        messengerRoomId: existingMessengerRoomId,
        sourceHint: existingRoomSource,
      });
      return;
    }
    openCreateTradeChat(router, { productId });
  };

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={handleClick}
        onPointerEnter={() => {
          prefetchTradeChatEntry(router, {
            productId,
            existingRoomId,
            existingRoomSource,
            existingMessengerRoomId,
            prepareIfCreate: true,
          });
        }}
        disabled={disabled}
        className={className ?? "rounded-ui-rect bg-signature px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"}
      >
        {label}
      </button>
    </div>
  );
}
