import { CommunityGroupChatRoomClient } from "@/components/community-group-chat/CommunityGroupChatRoomClient";
import { loadCommunityGroupChatRoomInitialData } from "@/lib/community-group-chat/meeting-group-chat-room-initial-data";

interface Props {
  params: Promise<{ meetingId: string; roomId: string }>;
}

export default async function MeetingGroupChatRoomPage({ params }: Props) {
  const { meetingId, roomId } = await params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return null;
  const initialData = await loadCommunityGroupChatRoomInitialData(mid, rid);
  return (
    <CommunityGroupChatRoomClient
      key={`${mid}:${rid}`}
      meetingId={mid}
      roomId={rid}
      initialData={initialData ?? undefined}
    />
  );
}
