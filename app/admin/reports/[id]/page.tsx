import { AdminUnifiedReportDetailRouter } from "@/components/admin/reports/AdminUnifiedReportDetailRouter";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminReportDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminUnifiedReportDetailRouter reportId={id} />;
}
