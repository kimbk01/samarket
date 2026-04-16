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
   * RSC에서 무거운 부트스트랩을 await 하면 하단 「메신저」탭 전환마다 서버·페이로드가 쌓인다.
   * 대신 클라이언트는 `useCommunityMessengerHomeBootstrap` + `cm-bootstrap-client-fetch`(단일 비행)·
   * `home-sync` 묶음으로 **가볍게** 맞춘다(`docs/trade-lightweight-design.md`).
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
