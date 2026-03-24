import { AdminPointChargeDetailPage } from "@/components/admin/points/AdminPointChargeDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPointChargeDetailRoute({
  params,
}: PageProps) {
  const { id } = await params;
  return <AdminPointChargeDetailPage requestId={id} />;
}
