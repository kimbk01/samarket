import { notFound, permanentRedirect } from "next/navigation";
import { philifeAppPaths } from "@/lib/philife/paths";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default async function MeetingGroupChatNewPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) notFound();
  permanentRedirect(philifeAppPaths.meeting(id));
}
