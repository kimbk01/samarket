import { StoreReportPageClient } from "@/components/stores/StoreReportPageClient";

export default async function StoreReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const product = typeof sp.product === "string" ? sp.product.trim() : "";
  return <StoreReportPageClient slug={slug} productId={product || undefined} />;
}
