import { redirect } from "next/navigation";
import { loadPhilifeMeetingHubData } from "@/lib/neighborhood/philife-meeting-hub-load";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default async function CommunityMeetingPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) redirect("/philife");
  const hub = await loadPhilifeMeetingHubData(id);
  if (hub?.isJoined && hub.defaultOpenChatRoomId) {
    redirect(philifeAppPaths.meetingOpenChatRoom(id, hub.defaultOpenChatRoomId));
  }
  redirect(philifeAppPaths.meeting(id));
}
