import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";

/** `/market/[slug]` 거래 피드 전환 */
export default function MarketSegmentLoading() {
  return <MainFeedRouteLoading rows={5} />;
}
