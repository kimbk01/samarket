import { AdminPointExecutionDetailPage } from "@/components/admin/point-executions/AdminPointExecutionDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPointExecutionDetailRoute({
  params,
}: PageProps) {
  const { id } = await params;
  return <AdminPointExecutionDetailPage executionId={id} />;
}
