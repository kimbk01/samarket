import { AdminRecommendationReportDetailPage } from "@/components/admin/recommendation-reports/AdminRecommendationReportDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RecommendationReportDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  return <AdminRecommendationReportDetailPage reportId={id} />;
}
