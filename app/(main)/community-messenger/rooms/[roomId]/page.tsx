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

/**
 * 거래 채팅(`/chats/[roomId]`)과 같이 방 부트스트랩을 RSC에서 한 번 내려
 * 클라이언트가 빈 화면·「불러오는 중」을 기다리는 HTTP 왕복을 줄인다.
 */
export default async function CommunityMessengerRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ callAction?: string; sessionId?: string; cm_ctx?: string }>;
}) {
  const { roomId } = await params;
  const { callAction, sessionId } = await searchParams;
  const viewerUserId = await getOptionalAuthenticatedUserId();
  const initialServerSnapshot = viewerUserId
    ? await loadCommunityMessengerRoomBootstrap(
        createSupabaseCommunityMessengerReadPort(),
        viewerUserId,
        String(roomId ?? "").trim(),
        {
          /** 클라이언트 `?mode=lite&memberHydration=minimal` 과 동일 — RSC 첫 스냅샷 무게 절감 */
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
