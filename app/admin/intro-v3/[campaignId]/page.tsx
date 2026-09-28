import { AdminIntroV3DraftPage } from "@/components/admin/intro-v3/AdminIntroV3DraftPage";

export default async function AdminIntroV3CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminIntroV3DraftPage campaignId={campaignId} />;
}
