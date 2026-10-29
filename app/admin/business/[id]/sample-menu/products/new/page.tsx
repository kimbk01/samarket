import { Suspense } from "react";
import { AdminSampleMenuShell } from "@/components/admin/business/AdminSampleMenuShell";

export default async function AdminSampleMenuNewProductRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string; menuSectionId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const menuSectionId = typeof sp.menuSectionId === "string" ? sp.menuSectionId.trim() : "";
  const draft = sp.draft === "1" || sp.draft === "true";
  return (
    <Suspense fallback={<p className="p-4 text-sm text-sam-muted">…</p>}>
      <AdminSampleMenuShell storeId={id} view={{ kind: "new", menuSectionId, draft }} />
    </Suspense>
  );
}
