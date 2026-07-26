import { Suspense } from "react";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";
import { OwnerStoreNeedStoreIdRscMessage } from "@/components/business/owner/OwnerStoreNeedStoreIdRscMessage";

export default function OwnerNewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; draft?: string; menuSectionId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFormRouteLoading />}>
      <OwnerNewProductPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerNewProductPageBody({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; draft?: string; menuSectionId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  const defaultDraft = sp.draft === "1" || sp.draft === "true";
  const menuSectionId =
    typeof sp.menuSectionId === "string" ? sp.menuSectionId.trim() : "";
  if (!storeId) {
    return (
      <OwnerStoreNeedStoreIdRscMessage
        hintKey="owner_store_need_store_id_suffix_products"
        useScrollShell={false}
      />
    );
  }
  return (
    <OwnerProductForm
      mode="new"
      storeId={storeId}
      defaultDraft={defaultDraft}
      initialMenuSectionId={menuSectionId}
    />
  );
}
