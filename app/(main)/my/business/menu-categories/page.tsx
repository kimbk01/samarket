import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerMenuCategoriesClient } from "@/components/business/owner/OwnerMenuCategoriesClient";
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
      <OwnerAdminPageScrollShell>
        <div className="px-4 py-8">
          <p className="sam-text-body text-sam-fg">
            매장을 지정할 수 없습니다.{" "}
            <Link href="/stores/owner" className="font-medium text-signature underline">
              내 상점
            </Link>
            에서 「카테고리」를 눌러 주세요.
          </p>
        </div>
      </OwnerAdminPageScrollShell>
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
