import { AdminPlatformPopupDetailWorkspace } from "@/components/admin/platform-popup/AdminPlatformPopupDetailWorkspace";

export default async function AdminPlatformPopupDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminPlatformPopupDetailWorkspace campaignId={campaignId} />;
}
