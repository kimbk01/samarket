import { Suspense } from "react";
import { AdminCommunityMemberDetailPage } from "@/components/admin/community/members/AdminCommunityMemberDetailPage";

export default async function AdminCommunityMemberDetailRoute({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <Suspense fallback={null}>
      <AdminCommunityMemberDetailPage userId={userId} />
    </Suspense>
  );
}
