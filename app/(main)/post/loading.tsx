import { MarketCardMorphSegmentLoading } from "./MarketCardMorphSegmentLoading";

/**
 * `/post/[id]` segment loading.
 * Marketplace card→detail: morph coordinator owns the frame (no skeleton flash).
 * Direct/deep-link/refresh: falls back inside client to MainFeedRouteLoading.
 */
export default function PostSegmentLoading() {
  return <MarketCardMorphSegmentLoading />;
}
