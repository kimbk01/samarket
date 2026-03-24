"use client";

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { parseRoomId } from "@/lib/validate-params";

function ChatRoomPageInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = useMemo(() => parseRoomId(params.roomId), [params.roomId]);
  const openReviewOnMount = searchParams.get("review") === "1";

  return (
    <ChatRoomScreen roomId={roomId} openReviewOnMount={openReviewOnMount} listHref="/chats" />
  );
}

export default function ChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-sm text-gray-500">불러오는 중…</div>
      }
    >
      <ChatRoomPageInner />
    </Suspense>
  );
}
