import { AdminAdApplicationDetailPage } from "@/components/admin/ads/AdminAdApplicationDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAdApplicationDetailRoute({
  params,
}: PageProps) {
  const { id } = await params;
  return <AdminAdApplicationDetailPage applicationId={id} />;
}
