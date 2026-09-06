import { Suspense } from "react";
import { MainFormRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerProductForm } from "@/components/business/owner/OwnerProductForm";
import { OwnerProductNewStoreIdRedirect } from "@/components/business/owner/OwnerProductNewStoreIdRedirect";

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
      <OwnerProductNewStoreIdRedirect
        draft={defaultDraft}
        menuSectionId={menuSectionId || undefined}
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
