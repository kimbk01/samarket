import { TradeReviewsManagementView } from "@/components/mypage/reviews/TradeReviewsManagementView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeReviewsPage() {
  return (
    <TradeHubSectionShell title="거래 후기">
      <TradeReviewsManagementView />
    </TradeHubSectionShell>
  );
}
