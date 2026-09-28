import { redirect } from "next/navigation";

export default async function AdminIntroV3CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  redirect(`/admin/intro/${campaignId}`);
}
