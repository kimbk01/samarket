import { notFound, redirect } from "next/navigation";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";
import { buildTradeMarketFeedHref } from "@/lib/trade/tabs/trade-market-feed-href";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && v[0] != null) return v[0];
  return "";
}

/**
 * 레거시 `/market/[slug]` → 커뮤니티 패리티 `/market?category=` 로 통일.
 * 카테고리별 피드는 `MarketContent` 가 같은 표면에서 렌더한다.
 */
export default async function MarketCategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const slugOrId = normalizeMarketSlugParam(slug);
  if (!slugOrId.trim()) {
    notFound();
  }

  const topicRaw = firstString(sp.topic);
  const fsRaw = firstString(sp.fs);
  const sortRaw = firstString(sp.sort);

  const target = buildTradeMarketFeedHref({
    categoryId: slugOrId,
    topic: topicRaw || null,
    tradeState: firstString(sp.tradeState) || null,
    baseSearch:
      fsRaw || sortRaw
        ? new URLSearchParams({
            ...(fsRaw ? { fs: fsRaw } : {}),
            ...(sortRaw ? { sort: sortRaw } : {}),
          }).toString()
        : null,
  });

  redirect(target);
}
