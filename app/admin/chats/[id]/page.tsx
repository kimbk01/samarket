import { AdminChatDetailPage } from "@/components/admin/chats/AdminChatDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminChatDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminChatDetailPage roomId={id} />;
}
