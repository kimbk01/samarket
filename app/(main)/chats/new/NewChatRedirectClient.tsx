"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

export function NewChatRedirectClient({ productId }: { productId: string | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("채팅방으로 이동 중...");

  useEffect(() => {
    if (!productId) {
      router.replace(TRADE_CHAT_SURFACE.hubPath);
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await createOrGetChatRoom(productId);
      if (cancelled) return;
      if (!result.ok) {
        const errorMessage = result.error || "채팅방을 열 수 없습니다.";
        setMessage(errorMessage);
        router.replace(`${TRADE_CHAT_SURFACE.hubPath}?error=${encodeURIComponent(errorMessage)}`);
        return;
      }
      router.replace(`/mypage/trade/chat/${encodeURIComponent(result.roomId)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-center text-[14px] text-gray-500">{message}</p>
    </div>
  );
}
