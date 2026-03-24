import { AdminBusinessDetailPage } from "@/components/admin/business/AdminBusinessDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminBusinessDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminBusinessDetailPage profileId={id} />;
}
