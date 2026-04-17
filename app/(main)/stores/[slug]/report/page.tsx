import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreReportPageClient } from "@/components/stores/StoreReportPageClient";

export default function StoreReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <StoreReportPageBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function StoreReportPageBody({
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
