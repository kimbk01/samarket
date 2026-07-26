"use client";

import { useMemo } from "react";

import { Feed as PhilifeFeedClient } from "@/components/community/Feed";
import { resolveInitialCommunityFeedSnapshot } from "@/lib/community/resolve-initial-community-feed-snapshot";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";

/**
 * Community feed client island — **does not** own UI token scope
 * (server `CommunityHomeSurface` / tab panel wrapper owns scope for First HTML).
 *
 * Snapshot boot: Cold · Warm · tabEnter 모두 `resolveInitialCommunityFeedSnapshot`.
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
  void tabEnterInstantBoot;

  const resolvedInitialGlobalFeed = useMemo(() => {
    if (initialGlobalFeed) return initialGlobalFeed;
    return resolveInitialCommunityFeedSnapshot({ href: tabEnterHref });
  }, [initialGlobalFeed, tabEnterHref]);

  return <PhilifeFeedClient initialGlobalFeedRsc={resolvedInitialGlobalFeed} />;
}
