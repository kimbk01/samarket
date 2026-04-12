import { Suspense } from "react";
import { AdminPostsManagementPage } from "@/components/admin/posts-management/AdminPostsManagementPage";
import { fetchAdminPostsManagementProducts } from "@/lib/admin-products/admin-posts-management-data";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { Product } from "@/lib/types/product";

async function loadPostsServerSide(): Promise<Product[]> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return [];
  const { products } = await fetchAdminPostsManagementProducts(sb);
  return products;
}

export default async function AdminPostsManagementRoute() {
  const initialProducts = await loadPostsServerSide();

  return (
    <Suspense fallback={<div className="p-4 text-sam-muted">로딩 중…</div>}>
      <AdminPostsManagementPage initialProducts={initialProducts} />
    </Suspense>
  );
}
