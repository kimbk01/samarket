import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

type Search = { from?: string; filter?: string };

/**
 * 메신저 「배달 채팅」 묶음 — 배달·매장 주문 컨텍스트 방만 모아 보는 전용 서브 라우트.
 * 자세한 정책은 `trade-chats/page.tsx` 의 주석과 동일.
 */
async function DeliveryChatsBody({ searchParamsPromise }: { searchParamsPromise: Promise<Search> }) {
  const { filter } = await searchParamsPromise;
  return (
    <CommunityMessengerHome
      initialSection="chats"
      initialFilter={filter}
      pillar="delivery"
    />
  );
}

export default function DeliveryChatsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  return (
    <Suspense
      fallback={
        <>
          <CommunityMessengerHomeReturnConsume />
          <CommunityMessengerHomeShellSkeleton />
        </>
      }
    >
      <DeliveryChatsBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
