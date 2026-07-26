"use client";

import { useMemo } from "react";

import { Feed as PhilifeFeedClient } from "@/components/community/Feed";
import { resolveInitialCommunityFeedSnapshot } from "@/lib/community/resolve-initial-community-feed-snapshot";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

/**
 * Community feed client island — **does not** own UI token scope
 * (server `CommunityHomeSurface` / tab panel wrapper owns scope for First HTML).
 *
 * Route render 의 persistent snapshot 은 `CommunityFeed` layoutEffect 에서만 복원한다.
 * `tabEnterInstantBoot` 는 client-only 호환 경로이며 현재 route Surface 에서는 사용하지 않는다.
 * DO NOT: 일반 route 렌더 중 localStorage snapshot 을 prop 으로 주입(SSR/hydration 불일치).
 */
export function PhilifeFeedClientEntry({
  initialGlobalFeed = null,
  tabEnterInstantBoot = false,
  tabEnterHref = "/philife",
}: {
  initialGlobalFeed?: PhilifeGlobalFeedInitialRsc | null;
  /** @deprecated 이름만 호환 — true/false 모두 동일 snapshot resolver 사용 */
  tabEnterInstantBoot?: boolean;
  tabEnterHref?: string;
}) {
  const resolvedInitialGlobalFeed = useMemo(() => {
    if (initialGlobalFeed) return initialGlobalFeed;
    if (!tabEnterInstantBoot) return null;
    return resolveInitialCommunityFeedSnapshot({ href: tabEnterHref });
  }, [initialGlobalFeed, tabEnterHref, tabEnterInstantBoot]);

  return <PhilifeFeedClient initialGlobalFeedRsc={resolvedInitialGlobalFeed} />;
}
