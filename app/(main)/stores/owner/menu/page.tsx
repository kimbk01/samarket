import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { OwnerStoreNeedStoreIdRscMessage } from "@/components/business/owner/OwnerStoreNeedStoreIdRscMessage";

export default function OwnerMenuLegacyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawStoreId = sp.storeId;
  const storeId = (Array.isArray(rawStoreId) ? rawStoreId[0] : rawStoreId)?.trim() ?? "";
  if (!storeId) {
    return (
      <OwnerStoreNeedStoreIdRscMessage
        hintKey="owner_store_need_store_id_suffix_products"
        useScrollShell={false}
      />
    );
  }
  /** IA-07 — 옛 주소 이동 시 쿼리 보존 (storeId 외 필터도 그대로 · D-10 2026-11-03) */
  const next = new URLSearchParams();
  next.set("storeId", storeId);
  for (const [key, value] of Object.entries(sp)) {
    if (key === "storeId" || value == null) continue;
    for (const v of Array.isArray(value) ? value : [value]) next.append(key, v);
  }
  return redirect(`/stores/owner/products?${next.toString()}`);
}
