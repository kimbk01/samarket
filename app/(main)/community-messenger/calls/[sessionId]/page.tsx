import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";

async function CommunityMessengerCallPageBody({ paramsPromise }: { paramsPromise: Promise<{ sessionId: string }> }) {
  const { sessionId } = await paramsPromise;
  const userId = await getOptionalAuthenticatedUserId();
  const initialSession = userId ? await getCommunityMessengerCallSessionById(userId, sessionId) : null;
  return <CommunityMessengerCallClient sessionId={sessionId} initialSession={initialSession} />;
}

export default function CommunityMessengerCallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <CommunityMessengerCallPageBody paramsPromise={params} />
    </Suspense>
  );
}
