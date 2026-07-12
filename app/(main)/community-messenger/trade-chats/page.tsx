import { Suspense } from "react";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { MessengerPillarChatsSegment } from "@/components/community-messenger/MessengerPillarChatsSegment";
import { MessengerWideRouteGate } from "@/components/community-messenger/MessengerWideRouteGate";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

/**
 * 메신저 「거래 채팅」 — 본문은 클라 `useSearchParams` 만 쓰고 서버에서 `searchParams` Promise 를 await 하지 않아
 * 인박스→이 화면 전환이 RSC 해제를 기다리지 않는다.
 */
export default function TradeChatsPage() {
  return (
    <>
      <CommunityMessengerHomeReturnConsume />
      <Suspense fallback={<CommunityMessengerHomeShellSkeleton />}>
        <MessengerWideRouteGate>
          <MessengerPillarChatsSegment pillar="trade" />
        </MessengerWideRouteGate>
      </Suspense>
    </>
  );
}
