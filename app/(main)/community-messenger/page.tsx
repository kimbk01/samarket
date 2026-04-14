import nextDynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";

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
  const userId = await getOptionalAuthenticatedUserId();
  const initialServerBootstrap =
    userId != null ? await getCommunityMessengerBootstrap(userId, { skipDiscoverable: false }) : null;

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
