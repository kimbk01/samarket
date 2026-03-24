import { AdminUserDetailPage } from "@/components/admin/users/AdminUserDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminUserDetailPage userId={id} />;
}
