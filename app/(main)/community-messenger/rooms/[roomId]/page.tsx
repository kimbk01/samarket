import { Suspense } from "react";
import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadCommunityMessengerRoomBootstrap } from "@/lib/chat-domain/use-cases/community-messenger-bootstrap";
import { createSupabaseCommunityMessengerReadPort } from "@/lib/chat-infra-supabase/community-messenger/supabase-read-adapter";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT } from "@/lib/community-messenger/types";

async function CommunityMessengerRoomWithBootstrap({
  roomId,
  viewerUserId,
  callAction,
  sessionId,
}: {
  roomId: string;
  viewerUserId: string | null;
  callAction?: string;
  sessionId?: string;
}) {
  const rid = String(roomId ?? "").trim();
  const initialServerSnapshot =
    viewerUserId && rid
      ? await loadCommunityMessengerRoomBootstrap(
          createSupabaseCommunityMessengerReadPort(),
          viewerUserId,
          rid,
          {
            initialMessageLimit: Math.min(18, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT),
            hydrateFullMemberList: false,
          }
        )
      : null;
  return (
    <CommunityMessengerRoomClient
      key={rid}
      roomId={rid}
      initialCallAction={callAction}
      initialCallSessionId={sessionId}
      initialServerSnapshot={initialServerSnapshot}
    />
  );
}

async function CommunityMessengerRoomPageBody({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: Promise<{ roomId: string }>;
  searchParamsPromise: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  const [{ roomId }, { callAction, sessionId }] = await Promise.all([paramsPromise, searchParamsPromise]);
  const viewerUserId = await getOptionalAuthenticatedUserId();
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={6} />}>
      <CommunityMessengerRoomWithBootstrap
        roomId={String(roomId ?? "").trim()}
        viewerUserId={viewerUserId}
        callAction={callAction}
        sessionId={sessionId}
      />
    </Suspense>
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
