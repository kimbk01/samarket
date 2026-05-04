import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

type Search = { from?: string; filter?: string };

/**
 * 메신저 「거래 채팅」 묶음 — 거래 컨텍스트 방만 모아 보는 전용 서브 라우트.
 *
 * - 실제 데이터는 메신저 부트스트랩(`/api/community-messenger/bootstrap`)을 그대로 재사용한다.
 * - `pillar="trade"` 가 채팅 리스트를 거래방으로 강제 한정하고
 *   인박스 상단 묶음 행(거래/배달)은 노출하지 않는다.
 * - 1단 헤더 뒤로가기는 `/community-messenger?section=chats(&from=...)` 로 인박스 복귀.
 *   `?from` 은 클라이언트 셸 효과(`useCommunityMessengerHomeShellEffects`) 가 직접 파싱한다.
 */
async function TradeChatsBody({ searchParamsPromise }: { searchParamsPromise: Promise<Search> }) {
  const { filter } = await searchParamsPromise;
  return (
    <CommunityMessengerHome
      initialSection="chats"
      initialFilter={filter}
      pillar="trade"
    />
  );
}

export default function TradeChatsPage({
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
      <TradeChatsBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
