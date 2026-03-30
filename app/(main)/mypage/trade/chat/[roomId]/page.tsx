"use client";

import { Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { parseRoomId } from "@/lib/validate-params";

const LIST_HREF = "/mypage/trade/chat";

/** 거래 허브 레이아웃(상단 탭) 안에서 채팅 상세 — 별도 `/chats` 전체 화면으로 나가지 않음 */
function TradeHubChatRoomInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomId = useMemo(() => parseRoomId(params.roomId), [params.roomId]);
  const openReviewOnMount = searchParams.get("review") === "1";

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#DBDBDB] bg-white shadow-sm">
      <ChatRoomScreen
        roomId={roomId}
        openReviewOnMount={openReviewOnMount}
        listHref={LIST_HREF}
        tradeHubColumnLayout
      />
    </section>
  );
}

export default function TradeHubChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-gray-500">불러오는 중…</div>
      }
    >
      <TradeHubChatRoomInner />
    </Suspense>
  );
}
