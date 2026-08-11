import { AdminCommunityPostDetailPage } from "@/components/admin/community/AdminCommunityPostDetailPage";

export default async function AdminCommunityPostDetailRoute({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <AdminCommunityPostDetailPage postId={postId} />;
}
