import { Suspense } from "react";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { MessengerPillarChatsSegment } from "@/components/community-messenger/MessengerPillarChatsSegment";
import { MessengerWideRouteGate } from "@/components/community-messenger/MessengerWideRouteGate";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

/**
 * 메신저 「배달 채팅」 — `trade-chats/page.tsx` 와 동일(서버 searchParams await 제거).
 */
export default function DeliveryChatsPage() {
  return (
    <>
      <CommunityMessengerHomeReturnConsume />
      <Suspense fallback={<CommunityMessengerHomeShellSkeleton />}>
        <MessengerWideRouteGate>
          <MessengerPillarChatsSegment pillar="delivery" />
        </MessengerWideRouteGate>
      </Suspense>
    </>
  );
}
