import { CommunityMessengerRoomClient } from "@/components/community-messenger/CommunityMessengerRoomClient";

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
      roomId={roomId}
      initialCallAction={callAction}
      initialCallSessionId={sessionId}
    />
  );
}
