import { AdminFeedAdEditPage } from "@/components/admin/feed-ads/AdminFeedAdEditPage";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

/** 피드 배너 수정 (감사 AD-10) — 진입: 광고·배너 › 배너 현황 */
export default async function AdminFeedAdEditRoute({ params }: PageProps) {
  const { campaignId } = await params;
  return <AdminFeedAdEditPage campaignId={campaignId} />;
}
