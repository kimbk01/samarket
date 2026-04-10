"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  ensureClientAccessOrRedirect,
  redirectForBlockedAction,
} from "@/lib/auth/client-access-flow";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";

const tradeRoomPath = (roomId: string) =>
  `${TRADE_CHAT_SURFACE.hubPath}/${encodeURIComponent(roomId)}`;

interface ChatButtonProps {
  productId: string;
  /** 당근형: 있으면 "대화중인 채팅" 표시, 클릭 시 해당 방으로 이동 */
  existingRoomId?: string | null;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 당근형: 채팅하기 / 대화중인 채팅
 * - existingRoomId 없음 → "채팅하기", createOrGetChatRoom 후 이동
 * - existingRoomId 있음 → "대화중인 채팅", 해당 방으로 이동
 */
export function ChatButton({ productId, existingRoomId, disabled, className, children }: ChatButtonProps) {
  const { t, tt } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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
    void router.prefetch(TRADE_CHAT_SURFACE.hubPath);
    if (existingRoomId) {
      void router.prefetch(tradeRoomPath(existingRoomId));
    }
  }, [existingRoomId, router]);

  const handleClick = async () => {
    setError("");
    const user = getCurrentUser();
    if (!ensureClientAccessOrRedirect(router, user)) return;
    if (hasExisting) {
      warmChatRoomEntryById(existingRoomId);
      startTransition(() => {
        router.push(tradeRoomPath(existingRoomId));
      });
      return;
    }
    setLoading(true);
    const res = await createOrGetChatRoom(productId);
    if (res.ok) {
      warmChatRoomEntryById(res.roomId);
      startTransition(() => {
        router.push(tradeRoomPath(res.roomId));
      });
      return;
    }
    setLoading(false);
    if (redirectForBlockedAction(router, res.error)) return;
    setError(res.error);
  };

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={handleClick}
        onPointerEnter={() => {
          void router.prefetch(TRADE_CHAT_SURFACE.hubPath);
          if (existingRoomId) {
            void router.prefetch(tradeRoomPath(existingRoomId));
          }
        }}
        disabled={disabled || loading}
        className={className ?? "rounded-ui-rect bg-signature px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"}
      >
        {loading ? t("common_move_in_progress") : label}
      </button>
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}
