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
 * `?from=delivery` / `?from=trade` — 진입 출처(뒤로가기용)이기도 하지만,
 * `kind` 가 지정되지 않았을 때 해당 도메인 채팅 목록을 **기본 선택**으로 쓴다.
 * (배달 탭에서 메신저로 오면 배달 채팅이 먼저 보이고, 상단 칩으로 자유롭게 전환 가능)
 */
async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const { tab, section, filter, kind, from } = await searchParamsPromise;
  // kind 미지정 + from 출처로 도메인 기본 필터 결정
  // DO NOT: from 으로 pillar 강제(목록 고정)하지 않는다 — 칩 전환 자유 유지
  const resolvedKind =
    kind ??
    (from === "delivery" ? "delivery" : from === "trade" ? "trade" : undefined);
  return (
    <CommunityMessengerHome
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={resolvedKind}
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
