import Link from "next/link";
import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerProductsHubClient } from "@/components/business/owner/OwnerProductsHubClient";
import { loadOwnerProductsHubBootstrap } from "@/lib/stores/owner/load-owner-store-read-bootstrap";

export default function OwnerProductsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <OwnerProductsHubPageBody searchParams={searchParams} />
    </Suspense>
  );
}

async function OwnerProductsHubPageBody({
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
            에서 「상품 등록」을 눌러 주세요.
          </p>
        </div>
      </OwnerAdminPageScrollShell>
    );
  }
  const bootstrap = await loadOwnerProductsHubBootstrap(storeId);
  if (!bootstrap.ok) {
    return (
      <OwnerAdminPageScrollShell>
        <OwnerProductsHubClient
          key={storeId}
          storeId={storeId}
          rscBootstrapError={bootstrap.error}
        />
      </OwnerAdminPageScrollShell>
    );
  }
  return (
    <OwnerAdminPageScrollShell>
      <OwnerProductsHubClient
        key={storeId}
        storeId={storeId}
        initialSections={bootstrap.sections}
        initialProducts={bootstrap.products}
      />
    </OwnerAdminPageScrollShell>
  );
}
