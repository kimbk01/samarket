import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";
import { resolvePhilifeGlobalFeedInitialForRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

type PhilifeFeedRscSeedProps = {
  searchParamsPromise: Promise<{ category?: string; sort?: string }>;
};

/**
 * `/philife` RSC 스트리밍 시드 — page-level blocking `await` 없이 Suspense 자식으로만 fetch.
 * 현재 URL 주제·정렬과 동일한 `neighborhoodFeed` + `topicOptionsSeed` 1회 시드.
 */
export async function PhilifeFeedRscSeed({ searchParamsPromise }: PhilifeFeedRscSeedProps) {
  const [sp, viewerUserId] = await Promise.all([
    searchParamsPromise,
    getOptionalAuthenticatedUserId(),
  ]);
  const category = typeof sp.category === "string" ? sp.category.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort.trim() : "";

  let initialGlobalFeed = null;
  try {
    initialGlobalFeed = await resolvePhilifeGlobalFeedInitialForRsc(viewerUserId, { category, sort });
  } catch (e) {
    console.warn("[philife] RSC global feed seed failed, client will fetch", e);
  }

  return <PhilifeFeedClientEntry initialGlobalFeed={initialGlobalFeed} />;
}
