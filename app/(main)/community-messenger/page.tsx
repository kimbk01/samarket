import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";

type MessengerSearch = { tab?: string; section?: string; filter?: string; kind?: string; from?: string };

/**
 * 메신저 홈 RSC 는 **부트스트랩을 기다리지 않는다**.
 * 서버에서 DB·집계를 끝낼 때까지 HTML 이 막히면 탭 전환이 "멈춤"으로 보이므로,
 * 셸은 즉시 내리고 데이터는 `useCommunityMessengerHomeBootstrap` 이
 * `peekBootstrapCache`·`GET /api/community-messenger/bootstrap` 로만 맞춘다.
 *
 * `?from=delivery` / `?from=trade` — 1단 헤더 뒤로가기·세션 출처(`messenger-entry-origin`)용.
 * 인박스 채팅 목록 필터(`kind`)는 URL `kind`/`filter` 만 따른다 — `from` 으로 kind 를 강제하지 않는다.
 * (거래·배달 묶음은 `kind=all` 인박스 상단 pillar 행으로 노출)
 */
async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const { tab, section, filter, kind, from: _from } = await searchParamsPromise;
  void _from;
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
    <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
      <CommunityMessengerPageBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
