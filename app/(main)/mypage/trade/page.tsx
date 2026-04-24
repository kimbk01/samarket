import { TradePurchasesSection } from "@/components/mypage/trade/TradePurchasesSection";

/** 리다이렉트 제거 — `/mypage/trade` 에서 바로 구매 본문 렌더로 왕복 한 번 줄임 */
export default function MypageTradeHubIndexPage() {
  return <TradePurchasesSection />;
}
