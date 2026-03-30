import { OpenChatDetailPage } from "@/components/open-chat/OpenChatDetailPage";

interface PageProps {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ inviteCode?: string }>;
}

export default async function PhilifeOpenChatRoomPage({ params, searchParams }: PageProps) {
  const { roomId } = await params;
  const { inviteCode } = await searchParams;
  return <OpenChatDetailPage roomId={roomId} inviteCode={inviteCode} />;
}
