import { Suspense } from "react";
import dynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";

const CommunityMessengerRoomClient = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerRoomClient").then((m) => ({
      default: m.CommunityMessengerRoomClient,
    })),
  { loading: () => <MainFeedRouteLoading rows={6} /> }
);

async function CommunityMessengerRoomPageBody({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ roomId: string }>;
  searchParamsPromise: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  const { roomId } = await paramsPromise;
  const { callAction, sessionId } = await searchParamsPromise;
  const viewerUserId = await getOptionalAuthenticatedUserId();
  const initialServerSnapshot = viewerUserId
    ? await loadCommunityMessengerRoomBootstrap(
        createSupabaseCommunityMessengerReadPort(),
        viewerUserId,
        String(roomId ?? "").trim(),
        {
          initialMessageLimit: Math.min(18, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT),
          hydrateFullMemberList: false,
        }
      )
    : null;
  return (
    <CommunityMessengerRoomClient
      key={roomId}
      roomId={roomId}
      initialCallAction={callAction}
      initialCallSessionId={sessionId}
      initialServerSnapshot={initialServerSnapshot}
    />
  );
}

export default function CommunityMessengerRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={6} />}>
      <CommunityMessengerRoomPageBody paramsPromise={params} searchParamsPromise={searchParams} />
    </Suspense>
  );
}
