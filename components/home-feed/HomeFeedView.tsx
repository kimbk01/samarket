"use client";

import dynamic from "next/dynamic";
import { HomeProductList } from "@/components/home/HomeProductList";
import { isProductionDeploy } from "@/lib/config/deploy-surface";
import type { GetPostsForHomeResult } from "@/lib/posts/getPostsForHome";

const HomeFeedViewExperimental = dynamic(
  () =>
    import("./HomeFeedViewExperimental").then((m) => ({
      default: m.HomeFeedViewExperimental,
    })),
  { ssr: false, loading: () => null }
);

/**
 * 홈 상품 영역.
 * - production: 항상 Supabase 연동 `HomeProductList` (mock 피드 번들 미로드).
 * - 비-production: 기본은 동일. `NEXT_PUBLIC_ENABLE_EXPERIMENTAL_HOME_FEED=1` 일 때만 mock 섹션 피드.
 */
export function HomeFeedView({
  initialHomeTradeFeed,
}: {
  initialHomeTradeFeed?: GetPostsForHomeResult | null;
}) {
  if (isProductionDeploy()) {
    return <HomeProductList initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />;
  }

  const experimental =
    process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_HOME_FEED === "1" ||
    process.env.NEXT_PUBLIC_ENABLE_EXPERIMENTAL_HOME_FEED === "true";

  if (!experimental) {
    return <HomeProductList initialHomeTradeFeed={initialHomeTradeFeed ?? undefined} />;
  }

  return <HomeFeedViewExperimental />;
}
