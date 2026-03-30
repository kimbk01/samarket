import { MypageTradeHubChatList } from "@/components/mypage/MypageTradeHubChatList";
import { TradeHubSectionShell } from "@/components/mypage/trade/TradeHubSectionShell";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";

export default function TradeChatPage() {
  return (
    <TradeHubSectionShell title={TRADE_CHAT_SURFACE.hubTabLabel}>
      <MypageTradeHubChatList />
    </TradeHubSectionShell>
  );
}
