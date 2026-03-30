import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default async function CommunityMeetingPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim();
  if (!id) redirect("/philife");
  redirect(`/philife/meetings/${encodeURIComponent(id)}`);
}
