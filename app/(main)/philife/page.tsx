import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";
import { resolvePhilifeGlobalFeedInitialForRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

type PhilifePageProps = {
  searchParams: Promise<{ category?: string; sort?: string }>;
};

/**
 * RSC: 현재 URL 주제·정렬과 동일한 `neighborhoodFeed` 1회 시드 — 클라 첫 GET 과 경합/이중 요청을 줄인다.
 */
export default async function PhilifePage({ searchParams }: PhilifePageProps) {
  const [sp, viewerUserId] = await Promise.all([searchParams, getOptionalAuthenticatedUserId()]);
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
