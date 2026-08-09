import { AdminFeedAdRequestDetail } from "@/components/admin/ads/AdminFeedAdRequestDetail";

export default async function AdminFeedAdRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminFeedAdRequestDetail requestId={id} />;
}
