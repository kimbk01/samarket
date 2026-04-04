import { CommunityGroupChatCreateClient } from "@/components/community-group-chat/CommunityGroupChatCreateClient";

interface Props {
  params: Promise<{ meetingId: string }>;
}

export default async function MeetingGroupChatNewPage({ params }: Props) {
  const { meetingId } = await params;
  const id = meetingId?.trim() ?? "";
  if (!id) return null;
  return <CommunityGroupChatCreateClient meetingId={id} />;
}
