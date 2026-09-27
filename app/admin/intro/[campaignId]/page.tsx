import { AdminIntroEditorPage } from "@/components/admin/intro/AdminIntroEditorPage";

export default async function AdminIntroCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminIntroEditorPage campaignId={campaignId} />;
}
