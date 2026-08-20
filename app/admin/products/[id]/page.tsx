import { AdminProductDetailPage } from "@/components/admin/products/AdminProductDetailPage";
import { fetchAdminPostById } from "@/lib/admin-products/admin-posts-management-data";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailRoute({ params }: PageProps) {
  const { id } = await params;
  const sb = tryCreateSupabaseServiceClient();
  const initialProduct = sb
    ? ((await fetchAdminPostById(sb, id)).products[0] ?? null)
    : null;
  return <AdminProductDetailPage productId={id} initialProduct={initialProduct} />;
}
