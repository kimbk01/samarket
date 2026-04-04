import { notFound, permanentRedirect } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string; roomId: string }>;
}

export default async function MeetingGroupChatRoomPage({ params }: Props) {
  const { meetingId, roomId } = await params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) notFound();
  permanentRedirect(philifeAppPaths.meeting(mid));
}
