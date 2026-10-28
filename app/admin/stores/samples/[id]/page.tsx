import { AdminSampleStoreCatalogPage } from "@/components/admin/stores/AdminSampleStoreCatalogPage";

export default async function AdminSampleStoreCatalogRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminSampleStoreCatalogPage storeId={id} />;
}
