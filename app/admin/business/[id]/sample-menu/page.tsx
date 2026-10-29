import { Suspense } from "react";
import { AdminSampleMenuShell } from "@/components/admin/business/AdminSampleMenuShell";

export default async function AdminSampleMenuHubRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSampleMenuShell storeId={id} view={{ kind: "hub" }} />
    </Suspense>
  );
}
