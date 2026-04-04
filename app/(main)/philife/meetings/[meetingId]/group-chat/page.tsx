import { notFound, permanentRedirect } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
}

/** 제거된 커뮤니티 채팅 허브 */
export default async function MeetingGroupChatHubPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) notFound();
  permanentRedirect(philifeAppPaths.meeting(id));
}
