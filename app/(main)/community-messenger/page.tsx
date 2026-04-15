import nextDynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

const CommunityMessengerHome = nextDynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerHome").then((m) => m.CommunityMessengerHome),
  { loading: () => <MainFeedRouteLoading rows={4} /> }
);

export const dynamic = "force-dynamic";

export default async function CommunityMessengerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string; filter?: string; kind?: string }>;
}) {
  const { tab, section, filter, kind } = await searchParams;
  /**
   * RSC에서 `getCommunityMessengerBootstrap` 전체를 await 하면 하단 「메신저」탭 등
   * 클라이언트 전환마다 동일 무게의 서버 작업이 RSC 페이로드를 막아 체감 지연이 누적된다.
   * 데이터는 `useCommunityMessengerHomeBootstrap`(캐시·lite→full·home-sync)이 단일 경로로 맞춘다.
   */
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
