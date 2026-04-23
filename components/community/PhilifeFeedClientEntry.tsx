"use client";

import { Feed as PhilifeFeedClient } from "@/components/community/Feed";
import type { PhilifeGlobalFeedInitialRsc } from "@/lib/philife/resolve-philife-global-feed-initial-rsc";
export function PhilifeFeedClientEntry({
  initialGlobalFeed = null,
}: {
  initialGlobalFeed?: PhilifeGlobalFeedInitialRsc | null;
}) {
  return <PhilifeFeedClient initialGlobalFeedRsc={initialGlobalFeed} />;
}
