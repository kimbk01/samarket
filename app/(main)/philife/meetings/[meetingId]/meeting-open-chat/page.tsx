import { notFound, permanentRedirect } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
}

/** 레거시 URL → `/philife/meetings/.../group-chat` */
export default async function MeetingOpenChatHubPageRedirect({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) notFound();
  permanentRedirect(philifeAppPaths.meetingGroupChat(id));
}
