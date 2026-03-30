import { FavoriteProductsView } from "@/components/favorites/FavoriteProductsView";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";

export default function TradeFavoritesPage() {
  return (
    <TradeHubSectionShell title="찜 목록">
      <FavoriteProductsView embedded />
    </TradeHubSectionShell>
  );
}
