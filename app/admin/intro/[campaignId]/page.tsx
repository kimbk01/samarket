import { AdminIntroCampaignRoute } from "@/components/admin/intro/AdminIntroCampaignRoute";

export default async function AdminIntroCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminIntroCampaignRoute campaignId={campaignId} />;
}
