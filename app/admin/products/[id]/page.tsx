import { AdminProductDetailPage } from "@/components/admin/products/AdminProductDetailPage";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailRoute({ params }: PageProps) {
  const { id } = await params;
  return <AdminProductDetailPage productId={id} />;
}
