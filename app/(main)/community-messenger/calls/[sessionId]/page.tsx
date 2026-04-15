import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";

export default async function CommunityMessengerCallPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const userId = await getOptionalAuthenticatedUserId();
  const initialSession = userId ? await getCommunityMessengerCallSessionById(userId, sessionId) : null;
  return <CommunityMessengerCallClient sessionId={sessionId} initialSession={initialSession} />;
}
