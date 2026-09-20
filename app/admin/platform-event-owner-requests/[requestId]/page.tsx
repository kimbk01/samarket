import { AdminPlatformEventOwnerRequestDetailClient } from "@/components/admin/platform-events/AdminPlatformEventOwnerRequestDetailClient";

type Props = { params: Promise<{ requestId: string }> };

export default async function AdminPlatformEventOwnerRequestDetailPage({ params }: Props) {
  const { requestId } = await params;
  return <AdminPlatformEventOwnerRequestDetailClient requestId={requestId} />;
}
