import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

export const dynamic = "force-dynamic";

type MessengerSearch = { tab?: string; section?: string; filter?: string; kind?: string };

/**
 * 메신저 **목록**은 RSC에서 `getCommunityMessengerBootstrap` 을 await 하지 않는다.
 * 동일 데이터는 `GET /api/community-messenger/bootstrap` + `peekBootstrapCache` / `primeBootstrapCache` 만 사용해
 * 하단 탭 전환 시 서버가 DB·프로필 하이드레이션으로 RSC 페이로드를 막지 않게 한다.
 * `next/dynamic` 분할을 쓰지 않아 탭 선택 시 JS 청크 2단(로더→본체) 왕복을 없앤다.
 */
async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const { tab, section, filter, kind } = await searchParamsPromise;
  return (
    <CommunityMessengerHome
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={kind}
      initialServerBootstrap={null}
    />
  );
}

export default function CommunityMessengerPage({
  searchParams,
}: {
  searchParams: Promise<MessengerSearch>;
}) {
  return (
    <Suspense fallback={<CommunityMessengerHomeShellSkeleton />}>
      <CommunityMessengerPageBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
