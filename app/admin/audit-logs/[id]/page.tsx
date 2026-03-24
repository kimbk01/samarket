import { AdminAuditDetailPage } from "@/components/admin/audit/AdminAuditDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAuditLogDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminAuditDetailPage logId={id} />;
}
