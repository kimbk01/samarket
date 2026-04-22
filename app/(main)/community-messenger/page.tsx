import { Suspense } from "react";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeShellSkeleton } from "@/components/community-messenger/CommunityMessengerRouteSkeletons";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

export const dynamic = "force-dynamic";

type MessengerSearch = { tab?: string; section?: string; filter?: string; kind?: string };

async function CommunityMessengerPageBody({ searchParamsPromise }: { searchParamsPromise: Promise<MessengerSearch> }) {
  const [{ tab, section, filter, kind }, viewerUserId] = await Promise.all([
    searchParamsPromise,
    getOptionalAuthenticatedUserId(),
  ]);
  let initialServerBootstrap: CommunityMessengerBootstrap | null = null;
  if (viewerUserId) {
    try {
      initialServerBootstrap = await getCommunityMessengerBootstrap(viewerUserId, {
        skipDiscoverable: true,
        deferCallLog: true,
      });
    } catch {
      initialServerBootstrap = null;
    }
  }
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
    <Suspense fallback={<CommunityMessengerHomeShellSkeleton />}>
      <CommunityMessengerPageBody searchParamsPromise={searchParams} />
    </Suspense>
  );
}
