import { notFound } from "next/navigation";
import { getProductFromPostId } from "@/lib/products/getProductFromPostId";
import { parseId } from "@/lib/validate-params";
import { ProductDetailView } from "@/components/product/detail/ProductDetailView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const resolved = await params;
  const id = parseId(resolved.id);
  if (!id) notFound();
  const product = await getProductFromPostId(id);
  if (!product) notFound();
  return <ProductDetailView product={product} />;
}
