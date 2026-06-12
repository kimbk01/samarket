import { AdminAdProductsPageClient } from "@/components/admin/ad-products/AdminAdProductsPageClient";
import type { AdProduct } from "@/lib/ads/types";
import { fetchAllAdProductsFromDb } from "@/lib/ads/ad-products-supabase";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export default async function AdminAdProductsPage() {
  const svc = tryCreateSupabaseServiceClient();
  let products: AdProduct[] = [];

  if (svc) {
    const db = await fetchAllAdProductsFromDb(svc);
    if (db.ok) {
      products = db.products;
    }
  }

  return <AdminAdProductsPageClient products={products} />;
}
