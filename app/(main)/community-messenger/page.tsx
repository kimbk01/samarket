import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";

export default async function CommunityMessengerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; section?: string; filter?: string }>;
}) {
  const { tab, section, filter } = await searchParams;
  return <CommunityMessengerHome initialTab={tab} initialSection={section} initialFilter={filter} />;
}
