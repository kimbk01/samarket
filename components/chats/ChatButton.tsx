"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { ensureClientAccessOrRedirectAsync } from "@/lib/auth/client-access-flow";
import {
  openCreateTradeChat,
  openExistingTradeChat,
  prefetchTradeChatEntry,
} from "@/lib/chats/trade-chat-entry-navigation";
import type { ChatRoomSource } from "@/lib/types/chat";
import type { TradeChatComposePreviewFields } from "@/lib/chats/trade-chat-compose-preview-client";

interface ChatButtonProps {
  productId: string;
  /** 당근형: 있으면 "대화중인 채팅" 표시, 클릭 시 해당 방으로 이동 */
  existingRoomId?: string | null;
  existingRoomSource?: ChatRoomSource | null;
  /** 메신저 방 UUID — URL·prefetch 에만 사용, 부트스트랩은 `existingRoomId` */
  existingMessengerRoomId?: string | null;
  /** 신규 채팅 진입 시 compose 즉시 표시용 — 없으면 compose 가 플레이스홀더 shell 만 표시 */
  composePreview?: TradeChatComposePreviewFields;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 당근형: 채팅하기 / 대화중인 채팅
 * - existingRoomId 없음 → `openCreateTradeChat` 가 compose 로 이동한 뒤 방 확정·메신저 이동
 * - existingRoomId 있음 → 해당 방으로 이동
 */
export function ChatButton({
  productId,
  existingRoomId,
  existingRoomSource,
  existingMessengerRoomId,
  composePreview,
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
    void (async () => {
      if (!(await ensureClientAccessOrRedirectAsync(router))) return;
      if (hasExisting) {
        openExistingTradeChat(router, {
          productId,
          roomId: existingRoomId,
          messengerRoomId: existingMessengerRoomId,
          sourceHint: existingRoomSource,
        });
        return;
      }
      openCreateTradeChat(router, { productId, composePreview });
    })();
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
        onPointerDown={() => {
          if (disabled) return;
          prefetchTradeChatEntry(router, {
            productId,
            existingRoomId,
            existingRoomSource,
            existingMessengerRoomId,
            prepareIfCreate: !hasExisting,
          });
        }}
        disabled={disabled}
        className={className ?? "rounded-ui-rect bg-signature px-4 py-2.5 sam-text-body font-medium text-white disabled:opacity-50"}
      >
        {label}
      </button>
    </div>
  );
}
