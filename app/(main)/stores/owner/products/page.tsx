import { Suspense } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerProductsHubClient } from "@/components/business/owner/OwnerProductsHubClient";
import { OwnerStoreNeedStoreIdRscMessage } from "@/components/business/owner/OwnerStoreNeedStoreIdRscMessage";
import { loadOwnerProductsHubBootstrap } from "@/lib/stores/owner/load-owner-store-read-bootstrap";
/** 언어 재감사 2026-11-27: 로더 DB 원문을 화면에 넘기지 않는다 — 코드만 */
import { toOwnerBootstrapErrorCode } from "@/lib/business/owner-api-error-text";

/**
 * CONTRACT — do not Suspense-fallback to feed-route pulse skeleton.
 * Client already session-peeks products; RSC wait must not cover a warm shell with pulse.
 */
export default function OwnerProductsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string }>;
}) {
  return (
    <Suspense fallback={null}>
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
      <OwnerStoreNeedStoreIdRscMessage hintKey="owner_store_need_store_id_suffix_products" />
    );
  }
  const bootstrap = await loadOwnerProductsHubBootstrap(storeId);
  if (!bootstrap.ok) {
    return (
      <OwnerAdminPageScrollShell>
        <OwnerProductsHubClient
          key={storeId}
          storeId={storeId}
          rscBootstrapError={toOwnerBootstrapErrorCode(bootstrap.error)}
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
