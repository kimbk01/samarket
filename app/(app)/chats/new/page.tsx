"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createOrGetChatRoom } from "@/lib/chat/createOrGetChatRoom";

function NewChatRedirectInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  const [message, setMessage] = useState("채팅방으로 이동 중...");

  useEffect(() => {
    if (!productId?.trim()) {
      router.replace("/chats");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await createOrGetChatRoom(productId.trim());
      if (cancelled) return;
      if (!result.ok) {
        setMessage(result.error || "채팅방을 열 수 없습니다.");
        router.replace(
          `/chats?error=${encodeURIComponent(result.error || "채팅방을 열 수 없습니다.")}`
        );
        return;
      }
      router.replace(`/chats/${result.roomId}`);
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

/**
 * 상품 상세 "채팅하기" → 서버 API로 방 생성/조회 후 리다이렉트
 */
export default function NewChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-[14px] text-gray-500">채팅방으로 이동 중...</p>
        </div>
      }
    >
      <NewChatRedirectInner />
    </Suspense>
  );
}
