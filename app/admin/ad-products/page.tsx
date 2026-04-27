import { getAllAdProductsForAdmin } from "@/lib/ads/mock-ad-data";
import { AdminAdProductsPageClient } from "@/components/admin/ad-products/AdminAdProductsPageClient";

export default function AdminAdProductsPage() {
  const products = getAllAdProductsForAdmin();
  return <AdminAdProductsPageClient products={products} />;
}
