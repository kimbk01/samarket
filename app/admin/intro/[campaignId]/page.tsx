import { AdminIntroCmsEditorPage } from "@/components/admin/intro/AdminIntroCmsEditorPage";

export default async function AdminIntroCampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <AdminIntroCmsEditorPage campaignId={campaignId} />;
}
