import { AdminIntroOperatorForm } from "@/components/admin/intro/AdminIntroOperatorForm";

export default async function AdminIntroCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminIntroOperatorForm campaignId={campaignId} />;
}
