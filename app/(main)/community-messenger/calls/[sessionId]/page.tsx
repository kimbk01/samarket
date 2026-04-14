import nextDynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";

const CommunityMessengerCallClient = nextDynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerCallClient").then((m) => ({
      default: m.CommunityMessengerCallClient,
    })),
  { loading: () => <MainFeedRouteLoading rows={3} /> }
);

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
