import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerStoreNeedStoreIdRscMessage } from "@/components/business/owner/OwnerStoreNeedStoreIdRscMessage";

export default function OwnerMenuLegacyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <OwnerMenuLegacyRedirectPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerMenuLegacyRedirectPageBody({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  if (!storeId) {
    return (
      <OwnerStoreNeedStoreIdRscMessage
        hintKey="owner_store_need_store_id_suffix_products"
        useScrollShell={false}
      />
    );
  }
  return redirect(`/stores/owner/products?storeId=${encodeURIComponent(storeId)}`);
}
