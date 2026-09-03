import { Suspense } from "react";
import { AdminBusinessDetailPage } from "@/components/admin/business/AdminBusinessDetailPage";

export default async function AdminBusinessDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminBusinessDetailPage profileId={id} />
    </Suspense>
  );
}
