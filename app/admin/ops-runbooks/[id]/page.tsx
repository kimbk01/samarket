import { OpsRunbookExecutionDetailPage } from "@/components/admin/ops-runbooks/OpsRunbookExecutionDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OpsRunbookExecutionRoute({ params }: PageProps) {
  const { id } = await params;
  return <OpsRunbookExecutionDetailPage executionId={id} />;
}
