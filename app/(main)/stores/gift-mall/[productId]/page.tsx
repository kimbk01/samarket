import { Suspense } from "react";
import { BuyerGiftDetailView } from "@/components/gift-certificate/BuyerGiftDetailView";

function GiftDetailFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-sam-muted">…</div>
  );
}

export default async function GiftMallProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ storeId?: string }>;
}) {
  const { productId } = await params;
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  return (
    <Suspense fallback={<GiftDetailFallback />}>
      <BuyerGiftDetailView
        productId={String(productId ?? "").trim()}
        storeId={storeId || null}
      />
    </Suspense>
  );
}
