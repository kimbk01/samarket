import { StoreCartEntrySwitch } from "@/components/stores/StoreCartEntrySwitch";
import {
  STORE_CART_PAGE_PERF_SCRIPT_ID,
  buildStoreCartPageServerPerfPayload,
} from "@/lib/stores/store-cart-page-server-perf";

export default async function StoreCartPage({ params }: { params: Promise<{ slug: string }> }) {
  const rscT0 = performance.now();
  const { slug } = await params;
  const safe = typeof slug === "string" ? slug.trim() : "";
  const perf = buildStoreCartPageServerPerfPayload(safe, performance.now() - rscT0);

  const perfJson = JSON.stringify(perf);
  return (
    <>
      <script
        type="application/json"
        id={STORE_CART_PAGE_PERF_SCRIPT_ID}
        dangerouslySetInnerHTML={{ __html: perfJson }}
      />
      <meta name="samarket-cart-page-perf" content={perfJson} />
      <div className="flex min-h-0 flex-1 flex-col px-0 py-0">
        <StoreCartEntrySwitch storeSlug={safe} />
      </div>
    </>
  );
}
