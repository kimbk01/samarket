import { MarketCardOriginExpandLoading } from "./MarketCardOriginExpandLoading";

/**
 * `/post/[id]` segment loading.
 * Marketplace card→detail: geometry continuity surface (no CommunityFeedSkeleton flash).
 * Direct/deep-link/refresh: falls back inside client to MainFeedRouteLoading.
 */
export default function PostSegmentLoading() {
  return <MarketCardOriginExpandLoading />;
}
