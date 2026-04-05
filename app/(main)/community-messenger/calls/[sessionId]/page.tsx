import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";

export default async function CommunityMessengerCallPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <CommunityMessengerCallClient sessionId={sessionId} />;
}
