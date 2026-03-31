import { MeetingOpenChatCreateClient } from "@/components/meeting-open-chat/MeetingOpenChatCreateClient";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default async function MeetingOpenChatNewPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) return null;
  return <MeetingOpenChatCreateClient meetingId={id} />;
}
