import { notFound, permanentRedirect } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string; roomId: string }>;
}

/** 레거시 URL → `/philife/meetings/.../group-chat/[roomId]` */
export default async function MeetingOpenChatRoomPageRedirect({ params }: Props) {
  const { meetingId, roomId } = await params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) notFound();
  permanentRedirect(philifeAppPaths.meetingGroupChatRoom(mid, rid));
}
