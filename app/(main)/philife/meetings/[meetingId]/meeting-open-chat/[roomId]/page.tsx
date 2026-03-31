import { MeetingOpenChatRoomClient } from "@/components/meeting-open-chat/MeetingOpenChatRoomClient";

interface Props {
  params: Promise<{ meetingId: string; roomId: string }>;
}

export default async function MeetingOpenChatRoomPage({ params }: Props) {
  const { meetingId, roomId } = await params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return null;
  return <MeetingOpenChatRoomClient meetingId={mid} roomId={rid} />;
}
