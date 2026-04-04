import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";

export default async function CommunityMessengerPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <CommunityMessengerHome initialTab={tab} />;
}
