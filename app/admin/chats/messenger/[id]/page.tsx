import { AdminCommunityMessengerDetailPage } from "@/components/admin/community-messenger/AdminCommunityMessengerDetailPage";

export default async function AdminChatsMessengerDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminCommunityMessengerDetailPage roomId={id} />;
}
