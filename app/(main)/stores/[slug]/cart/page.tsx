import { Suspense } from "react";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { StoreCartEntrySwitch } from "@/components/stores/StoreCartEntrySwitch";
import { fetchStorePublicInitialOnServer } from "@/lib/stores/fetch-store-public-server";

export default function StoreCartPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <StoreCartPageBody params={params} />
    </Suspense>
  );
}

async function StoreCartPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug : "";
  const raw = await fetchStorePublicInitialOnServer(safe);
  const j = raw?.json as { ok?: boolean; store?: unknown } | undefined;
  const verified = raw?.status === 200 && !!j?.ok && !!j?.store;
  const initialApiForPrime = raw != null ? { status: raw.status, json: raw.json } : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col px-0 py-0">
      <StoreCartEntrySwitch
        key={safe}
        storeSlug={safe}
        initialVerifiedReal={verified}
        initialApiForPrime={initialApiForPrime}
      />
    </div>
  );
}
