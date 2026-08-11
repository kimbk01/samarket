import { AdminUserDetailPage } from "@/components/admin/users/AdminUserDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Canonical Admin Member Control Center — `/admin/users/[id]`. */
export default async function AdminUserDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminUserDetailPage userId={id} />;
}
