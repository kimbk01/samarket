import { Suspense } from "react";
import { AdminLoadingFallback } from "@/components/admin/AdminLoadingFallback";
import { AdminPostsManagementPage } from "@/components/admin/posts-management/AdminPostsManagementPage";
import { fetchAdminPostsManagementProducts } from "@/lib/admin-products/admin-posts-management-data";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { Product } from "@/lib/types/product";

async function loadPostsServerSide(): Promise<{ products: Product[]; total: number }> {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return { products: [], total: 0 };
  const { products, total } = await fetchAdminPostsManagementProducts(sb, {
    page: 1,
    pageSize: 40,
  });
  return { products, total: total ?? products.length };
}

export default async function AdminPostsManagementRoute() {
  const initial = await loadPostsServerSide();

  return (
    <Suspense fallback={<AdminLoadingFallback />}>
      <AdminPostsManagementPage
        initialProducts={initial.products}
        initialTotal={initial.total}
      />
    </Suspense>
  );
}
