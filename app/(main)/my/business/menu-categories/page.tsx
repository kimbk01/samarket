import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerMenuCategoriesClient } from "@/components/business/owner/OwnerMenuCategoriesClient";
import { OwnerStoreNeedStoreIdRscMessage } from "@/components/business/owner/OwnerStoreNeedStoreIdRscMessage";
import { loadOwnerMenuSectionsForRsc } from "@/lib/stores/owner/load-owner-store-read-bootstrap";

export default function MenuCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <MenuCategoriesPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function MenuCategoriesPageBody({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  const sp = await searchParams;
  const storeId = typeof sp.storeId === "string" ? sp.storeId.trim() : "";
  if (!storeId) {
    return (
      <OwnerStoreNeedStoreIdRscMessage hintKey="owner_store_need_store_id_suffix_menu_categories" />
    );
  }
  const sec = await loadOwnerMenuSectionsForRsc(storeId);
  if (!sec.ok) {
    return (
      <OwnerAdminPageScrollShell>
        <OwnerMenuCategoriesClient key={storeId} storeId={storeId} rscBootstrapError={sec.error} />
      </OwnerAdminPageScrollShell>
    );
  }
  return (
    <OwnerAdminPageScrollShell>
      <OwnerMenuCategoriesClient key={storeId} storeId={storeId} initialSections={sec.sections} />
    </OwnerAdminPageScrollShell>
  );
}
