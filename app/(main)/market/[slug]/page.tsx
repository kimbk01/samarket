import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
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

async function MarketCategoryPageBody({
  paramsPromise,
  searchParamsPromise,
}: {
  paramsPromise: PageProps["params"];
  searchParamsPromise: PageProps["searchParams"];
}) {
  const { slug } = await paramsPromise;
  const sp = await searchParamsPromise;
  const slugOrId = normalizeMarketSlugParam(slug);
  if (!slugOrId.trim()) {
    notFound();
  }

  const topicRaw = firstString(sp.topic);
  const jkRaw = firstString(sp.jk);

  let tradeServerSeed: ReturnType<typeof tradeServerSeedFromBootstrapPayload> | null = null;

  const postsClients = await resolvePostsReadClientsForServerComponent();

  if (postsClients) {
    const viewerUserId = await getOptionalAuthenticatedUserId();
    const result = await loadMarketBootstrapPayload(postsClients, {
      q: slugOrId,
      topic: topicRaw,
      jkParam: jkRaw || null,
      includePosts: true,
      viewerUserId,
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
    <MarketCategoryPageClient layoutKey={layoutKey} tradeServerSeed={tradeServerSeed} slugOrId={slugOrId} />
  );
}

export default function MarketCategoryPage({ params, searchParams }: PageProps) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <MarketCategoryPageBody paramsPromise={params} searchParamsPromise={searchParams} />
    </Suspense>
  );
}
