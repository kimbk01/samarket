import dynamic from "next/dynamic";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

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
  return (
    <CommunityMessengerRoomClient
      key={roomId}
      roomId={roomId}
      initialCallAction={callAction}
      initialCallSessionId={sessionId}
    />
  );
}
