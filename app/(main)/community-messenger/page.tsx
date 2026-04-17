import { Suspense, cache } from "react";
import nextDynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

const CommunityMessengerHome = nextDynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerHome").then((m) => m.CommunityMessengerHome),
  { loading: () => <MainFeedRouteLoading rows={4} /> }
);

export const dynamic = "force-dynamic";

const loadMessengerHomeBootstrapCached = cache(async (userId: string): Promise<CommunityMessengerBootstrap> =>
  getCommunityMessengerBootstrap(userId, { skipDiscoverable: true, deferCallLog: true })
);

type MessengerSearch = { tab?: string; section?: string; filter?: string; kind?: string };

async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const { tab, section, filter, kind } = await searchParamsPromise;
  const viewerUserId = await getOptionalAuthenticatedUserId();
  const initialServerBootstrap = viewerUserId ? await loadMessengerHomeBootstrapCached(viewerUserId) : null;
  return (
    <CommunityMessengerHome
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={kind}
      initialServerBootstrap={initialServerBootstrap}
    />
  );
}

export default function CommunityMessengerPage({
  searchParams,
}: {
  searchParams: Promise<MessengerSearch>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <CommunityMessengerPageBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
