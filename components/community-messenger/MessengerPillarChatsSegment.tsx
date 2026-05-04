"use client";

import { useSearchParams } from "next/navigation";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";

/**
 * 거래/배달 채팅 전용 서브 라우트 본문 — 서버에서 `searchParams` Promise 를 await 하지 않아
 * 클라 내비게이션 시 세그먼트 해제가 빨라진다.
 */
export function MessengerPillarChatsSegment({
  pillar,
}: {
  pillar: "trade" | "delivery";
}) {
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter")?.trim() || undefined;
  return (
    <CommunityMessengerHome initialSection="chats" initialFilter={filter} pillar={pillar} />
  );
}
