import { MeetingOpenChatRoomClient } from "@/components/meeting-open-chat/MeetingOpenChatRoomClient";
import { loadMeetingOpenChatRoomInitialData } from "@/lib/meeting-open-chat/meeting-open-chat-room-initial-data";

interface Props {
  params: Promise<{ meetingId: string; roomId: string }>;
}

export default async function MeetingOpenChatRoomPage({ params }: Props) {
  const { meetingId, roomId } = await params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return null;
  const initialData = await loadMeetingOpenChatRoomInitialData(mid, rid);
  return (
    <MeetingOpenChatRoomClient
      key={`${mid}:${rid}`}
      meetingId={mid}
      roomId={rid}
      initialData={initialData ?? undefined}
    />
  );
}
