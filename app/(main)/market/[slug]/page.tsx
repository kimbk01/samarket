import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadMarketBootstrapPayload } from "@/lib/market/load-market-bootstrap-payload";
import { tradeServerSeedFromBootstrapPayload } from "@/lib/market/trade-category-server-seed";
import {
  toCategoryWithSettings,
  type CategoryDbRow,
} from "@/lib/categories/to-category-with-settings";
import { getCategoryPathForRedirect } from "@/lib/categories/category-href-server";
import { buildMarketBootstrapQueryKey } from "@/lib/market/build-market-bootstrap-query-key";
import { MarketCategoryPageClient } from "@/components/market/MarketCategoryPageClient";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v[0] != null) return v[0];
  return "";
}

export default async function MarketCategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const slugOrId = normalizeMarketSlugParam(slug);
  if (!slugOrId.trim()) {
    notFound();
  }

  const topicRaw = firstString(sp.topic);
  const jkRaw = firstString(sp.jk);

  let tradeServerSeed: ReturnType<typeof tradeServerSeedFromBootstrapPayload> | null = null;

  const cookieSb = await createSupabaseRouteHandlerClient();
  const svcSb = tryCreateSupabaseServiceClient();
  const supabase = svcSb ?? cookieSb;

  if (supabase) {
    const result = await loadMarketBootstrapPayload(supabase, {
      q: slugOrId,
      topic: topicRaw,
      jkParam: jkRaw || null,
      includePosts: true,
    });

    if (result.ok) {
      const cat = toCategoryWithSettings(result.data.category as unknown as CategoryDbRow);
      if (cat.type !== "trade") {
        redirect(getCategoryPathForRedirect(cat));
      }
      tradeServerSeed = tradeServerSeedFromBootstrapPayload(slugOrId, topicRaw, jkRaw || null, result.data);
    } else if (result.httpStatus === 404) {
      notFound();
    }
  }

  const layoutKey =
    tradeServerSeed?.queryKey ?? buildMarketBootstrapQueryKey(slugOrId, topicRaw, jkRaw || null);

  return (
    <Suspense
      fallback={
        <div className="min-h-[200px] flex items-center justify-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      }
    >
      <MarketCategoryPageClient layoutKey={layoutKey} tradeServerSeed={tradeServerSeed} slugOrId={slugOrId} />
    </Suspense>
  );
}
