"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChatRoomScreen } from "@/components/chats/ChatRoomScreen";
import { parseRoomId } from "@/lib/validate-params";

const LIST_HREF = "/mypage/trade/chat";

/**
 * `useSearchParams` 는 Suspense 를 유발해 채팅 상세 전체가 «불러오는 중…» 에 걸린다.
 * 클라이언트에서만 쿼리 읽기 → 동일 경로에서 첫 페인트부터 `ChatRoomScreen` 마운트.
 */
function useClientReviewQueryFlag(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setOpen(q.get("review") === "1");
    } catch {
      setOpen(false);
    }
  }, []);
  return open;
}

/** 거래 허브 레이아웃(상단 탭) 안에서 채팅 상세 — 별도 `/chats` 전체 화면으로 나가지 않음 */
export default function TradeHubChatRoomPage() {
  const params = useParams();
  const roomId = useMemo(() => parseRoomId(params.roomId), [params.roomId]);
  const openReviewOnMount = useClientReviewQueryFlag();

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-rect border border-ig-border bg-white shadow-sm">
      <ChatRoomScreen
        roomId={roomId}
        openReviewOnMount={openReviewOnMount}
        listHref={LIST_HREF}
        tradeHubColumnLayout
      />
    </section>
  );
}
