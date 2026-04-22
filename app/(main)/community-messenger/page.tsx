import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";

export const dynamic = "force-dynamic";

type MessengerSearch = { tab?: string; section?: string; filter?: string; kind?: string };

/**
 * 메신저 홈 RSC 는 **부트스트랩을 기다리지 않는다**.
 * 서버에서 DB·집계를 끝낼 때까지 HTML 이 막히면 탭 전환이 “멈춤”으로 보이므로,
 * 셸은 즉시 내리고 데이터는 `useCommunityMessengerHomeBootstrap` 이
 * `peekBootstrapCache`·`GET /api/community-messenger/bootstrap` 로만 맞춘다.
 */
async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const { tab, section, filter, kind } = await searchParamsPromise;
  return (
    <CommunityMessengerHome
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={kind}
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
