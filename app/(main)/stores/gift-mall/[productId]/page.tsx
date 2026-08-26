import { BuyerGiftDetailView } from "@/components/gift-certificate/BuyerGiftDetailView";

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
    <BuyerGiftDetailView
      productId={String(productId ?? "").trim()}
      storeId={storeId || null}
    />
  );
}
