import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";
import { resolvePhilifeGlobalFeedInitialForRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

type PhilifePageProps = {
  searchParams: Promise<{ category?: string; sort?: string }>;
};

/**
 * RSC: 기본(전체·쿼리 없음) 탭이면 `neighborhoodFeed` 1회 시드 — 클라 첫 GET 과 경합/이중 요청을 줄인다.
 */
export default async function PhilifePage({ searchParams }: PhilifePageProps) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category.trim() : "";
  const sort = typeof sp.sort === "string" ? sp.sort.trim() : "";
  const shouldSeedList = !category && !sort;

  const viewerUserId = await getOptionalAuthenticatedUserId();
  let initialGlobalFeed = null;
  if (shouldSeedList) {
    try {
      initialGlobalFeed = await resolvePhilifeGlobalFeedInitialForRsc(viewerUserId);
    } catch (e) {
      console.warn("[philife] RSC global feed seed failed, client will fetch", e);
    }
  }

  return <PhilifeFeedClientEntry initialGlobalFeed={initialGlobalFeed} />;
}
