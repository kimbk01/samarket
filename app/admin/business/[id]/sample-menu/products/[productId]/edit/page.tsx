import { Suspense } from "react";
import { AdminSampleMenuShell } from "@/components/admin/business/AdminSampleMenuShell";

export default async function AdminSampleMenuEditProductRoute({
  params,
}: {
  params: Promise<{ id: string; productId: string }>;
}) {
  const { id, productId } = await params;
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSampleMenuShell storeId={id} view={{ kind: "edit", productId }} />
    </Suspense>
  );
}
