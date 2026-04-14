import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerBootstrap } from "@/lib/community-messenger/service";

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
