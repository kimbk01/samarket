"use client";

import dynamic from "next/dynamic";
import { CommunityFeedSkeleton } from "@/components/community/CommunityFeedSkeleton";

const PhilifeFeedClient = dynamic(
  () => import("@/components/community/Feed").then((m) => ({ default: m.Feed })),
  {
    loading: () => <CommunityFeedSkeleton rows={5} />,
    /** 서버 RSC 에서 피드 트리를 돌리지 않음 — 첫 HTML·번들 경계만 먼저 */
    ssr: false,
  }
);

export function PhilifeFeedClientEntry() {
  return <PhilifeFeedClient />;
}
